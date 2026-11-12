'use strict';

const crypto = require('node:crypto');
const Alexa = require('ask-sdk-core');
const TidyModel = require('../../js/model.js');
const TidySharedModel = require('../../js/sharing-model.js');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://thviqhojcjrmqurhdkql.supabase.co').replace(/\/+$/, '');
const PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
const HOUSEHOLD_METADATA_KEY = 'tidyish_alexa_house_id';
if (!process.env.ALEXA_SKILL_ID) throw new Error('ALEXA_SKILL_ID is required for Alexa request verification');

class SupabaseError extends Error {
  constructor(status, code) {
    super('Supabase request failed');
    this.name = 'SupabaseError';
    this.status = status;
    this.code = code || '';
  }
}

class NetworkError extends Error {
  constructor() {
    super('Network request failed');
    this.name = 'NetworkError';
  }
}

class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserFacingError';
  }
}

class IndeterminateSaveError extends Error {
  constructor() {
    super('Task save could not be confirmed');
    this.name = 'IndeterminateSaveError';
  }
}

function requestHeaders(accessToken) {
  if (!PUBLISHABLE_KEY) throw new Error('SUPABASE_PUBLISHABLE_KEY is not configured');
  return {
    apikey: PUBLISHABLE_KEY,
    authorization: `Bearer ${accessToken}`,
    accept: 'application/json',
    'content-type': 'application/json'
  };
}

async function supabase(path, accessToken, { method = 'GET', body, signal } = {}) {
  let response;
  let text;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: requestHeaders(accessToken),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {})
    });
    text = await response.text();
  } catch {
    throw new NetworkError();
  }

  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!response.ok) throw new SupabaseError(response.status, data?.code);
  return data;
}

function rpc(name, args, accessToken, signal) {
  const permitted = new Set([
    'mission_house_sharing',
    'tidyish_household_v2',
    'save_mission_board',
    'save_shared_mission_board'
  ]);
  if (!permitted.has(name)) throw new Error('Unapproved Tidy-ish RPC');
  return supabase(`/rest/v1/rpc/${name}`, accessToken, { method: 'POST', body: args, signal });
}

function isMissingRpc(error) {
  return error?.code === 'PGRST202' || error?.status === 404;
}

async function accessibleHouseholds(user, accessToken, signal) {
  const optionalHouseList = async (name, args) => {
    try { return await rpc(name, args, accessToken, signal); }
    catch (error) {
      if (isMissingRpc(error)) return null;
      throw error;
    }
  };
  const [oldResult, newResult] = await Promise.all([
    optionalHouseList('mission_house_sharing', { action: 'list' }),
    optionalHouseList('tidyish_household_v2', { action: 'list' })
  ]);

  const houses = new Map();
  for (const house of Array.isArray(oldResult?.houses) ? oldResult.houses : []) {
    if (house?.id) houses.set(String(house.id), { ...house, kind: 'legacy' });
  }
  if (!houses.has(user.id)) houses.set(user.id, { id: user.id, label: 'My old house', kind: 'legacy' });

  for (const house of Array.isArray(newResult?.houses) ? newResult.houses : []) {
    if (house?.id) houses.set(String(house.id), { ...house, kind: 'v2' });
  }

  const selectedId = String(user.user_metadata?.[HOUSEHOLD_METADATA_KEY] || '');
  const selected = houses.get(selectedId);
  if (!selected) {
    throw new UserFacingError('Open the Tidy-ish link in your Alexa app and choose a connected household first.');
  }
  return selected;
}

async function loadBoard(user, house, accessToken, signal) {
  let payload;
  let revision;
  if (house.kind === 'v2') {
    const result = await rpc('tidyish_household_v2', { action: 'read', p_house_id: house.id }, accessToken, signal);
    payload = result?.payload;
    revision = result?.revision;
  } else {
    const query = new URL('/rest/v1/mission_boards', `${SUPABASE_URL}/`);
    query.searchParams.set('select', 'payload,revision');
    query.searchParams.set('user_id', `eq.${house.id}`);
    query.searchParams.set('limit', '1');
    const rows = await supabase(query.pathname + query.search, accessToken, { signal });
    if (!Array.isArray(rows) || !rows.length) {
      throw new UserFacingError('This household has no online board yet. Open Tidy-ish and enable household sync first.');
    }
    payload = rows[0].payload;
    revision = rows[0].revision;
  }

  TidySharedModel.validateRaw(payload);
  if (!Number.isFinite(Number(revision))) throw new UserFacingError('I could not read this household board. Nothing was changed.');
  return { payload, revision: Number(revision) };
}

async function connectedHousehold(accessToken, signal) {
  if (!accessToken) return null;
  const user = await supabase('/auth/v1/user', accessToken, { signal });
  if (!user?.id) throw new SupabaseError(401, 'no_user');
  const house = await accessibleHouseholds(user, accessToken, signal);
  const board = await loadBoard(user, house, accessToken, signal);
  return { user, house, ...board, boardModel: TidySharedModel.importRaw(board.payload) };
}

function normalizeWords(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roomAliases(room) {
  const aliases = [room.name, room.id, String(room.id || '').replace(/-/g, ' ')];
  const extras = {
    entrance: ['downstairs entrance', 'entrance landing'],
    hall: ['hallway', 'main hallway'],
    cats: ['cat tray area', 'cat trays'],
    print: ['three d printer room', 'printer room'],
    storage: ['craft room']
  };
  aliases.push(...(extras[room.id] || []));
  return [...new Set(aliases.map(normalizeWords).filter(Boolean))];
}

function parseTaskCommand(command, board) {
  const input = String(command || '').trim().replace(/[.!?,;]+$/u, '');
  const prefix = /^(?:please\s+)?(?:add\s+)?(?:a\s+)?task\s+(?:to\s+)?/iu;
  const cleanTitle = value => String(value || '').replace(prefix, '').replace(/^to\s+/iu, '').trim();
  const roomMatches = [];
  const roomClause = [...input.matchAll(/\s+in\s+(?:the\s+)?/giu)].at(-1);
  if (roomClause) {
    const roomWords = normalizeWords(input.slice(roomClause.index + roomClause[0].length));
    if (['general', 'no room', 'unassigned'].includes(roomWords)) {
      roomMatches.push({ title: input.slice(0, roomClause.index).trim(), roomId: '', roomName: 'General' });
    } else {
      for (const room of (board.rooms || []).filter(item => !item.archived)) {
        if (roomAliases(room).includes(roomWords)) {
          roomMatches.push({ title: input.slice(0, roomClause.index).trim(), roomId: room.id, roomName: room.name });
        }
      }
    }
  }

  const uniqueMatches = [...new Map(roomMatches.map(room => [`${room.title}\u0000${room.roomId}`, room])).values()];
  const selected = uniqueMatches[0];
  let title = cleanTitle(selected ? selected.title : input);
  if (!title || title.length > 150) {
    throw new UserFacingError('Keep the task name between 1 and 150 characters.');
  }

  if (!selected) return { title, roomId: '', roomName: 'General' };
  const roomIds = [...new Set(uniqueMatches.map(room => room.roomId))];
  if (roomIds.length > 1) {
    throw new UserFacingError(`That room name is ambiguous. Use the full Tidy-ish room name: ${uniqueMatches.map(room => room.roomName).join(' or ')}.`);
  }
  return { title, roomId: selected.roomId, roomName: selected.roomName };
}

function taskIdForRequest(requestId, houseId) {
  const bytes = crypto.createHash('sha256').update(`tidyish-alexa:${houseId}:${requestId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function findExistingTask(board, title, roomId, taskId) {
  return (board.tasks || []).find(task =>
    task.id === taskId || (!task.side && !task.done && task.room === roomId && normalizeWords(task.title) === normalizeWords(title))
  );
}

async function saveNewTask(accessToken, expectedHouseId, pending, signal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await connectedHousehold(accessToken, signal);
    if (current.house.id !== expectedHouseId) {
      throw new UserFacingError('The selected household changed. Start the add again so Alexa can confirm the right board.');
    }

    const existing = findExistingTask(current.boardModel, pending.title, pending.roomId, pending.taskId);
    if (existing) return { alreadyAdded: true, title: existing.title, roomName: pending.roomName };

    const room = pending.roomId ? current.boardModel.rooms.find(item => item.id === pending.roomId && !item.archived) : null;
    if (pending.roomId && !room) {
      throw new UserFacingError('That room is no longer available. Nothing was added; please start again.');
    }

    const task = TidyModel.task({
      id: pending.taskId,
      title: pending.title,
      room: pending.roomId,
      side: false,
      doing: false,
      taskType: 'cleaning',
      priority: 3
    });
    TidyModel.add(current.boardModel, task);
    const projected = TidySharedModel.project(current.boardModel, current.payload, current.user.id);
    const row = projected.tasks.find(item => item.id === pending.taskId);
    if (!row) throw new UserFacingError('I could not prepare that task for Tidy-ish. Nothing was changed.');
    const nextPayload = TidyModel.clone(current.payload);
    nextPayload.tasks = [...(nextPayload.tasks || []), row];

    try {
      if (current.house.kind === 'v2') {
        const result = await rpc('tidyish_household_v2', {
          action: 'save',
          p_house_id: current.house.id,
          expected_revision: current.revision,
          new_payload: nextPayload
        }, accessToken, signal);
        if (result?.saved === true) return { alreadyAdded: false, title: pending.title, roomName: pending.roomName };
      } else {
        const owner = current.house.id === current.user.id;
        const result = await rpc(owner ? 'save_mission_board' : 'save_shared_mission_board', {
          ...(owner ? {} : { house_id: current.house.id }),
          expected_revision: current.revision,
          new_payload: nextPayload
        }, accessToken, signal);
        if (result === true) return { alreadyAdded: false, title: pending.title, roomName: pending.roomName };
      }
    } catch (error) {
      if (error instanceof NetworkError || error.status >= 500) throw new IndeterminateSaveError();
      if (error.status === 401) throw error;
      throw new UserFacingError('Tidy-ish did not accept that change. No task was added.');
    }
  }
  throw new UserFacingError('The household changed while I was saving. Nothing was added; please try again.');
}

function escapeSpeech(value) {
  return String(value ?? '').replace(/&/g, 'and').replace(/[<>]/g, ' ').replace(/["']/g, '').replace(/\s+/g, ' ').trim();
}

function accountLinkRequired(handlerInput) {
  return handlerInput.responseBuilder
    .speak('Please link your Tidy-ish account in the Alexa app before adding household tasks.')
    .withLinkAccountCard()
    .withShouldEndSession(true)
    .getResponse();
}

function clearPending(handlerInput) {
  const attributes = handlerInput.attributesManager.getSessionAttributes();
  delete attributes.pendingTask;
  handlerInput.attributesManager.setSessionAttributes(attributes);
}

const LaunchRequestHandler = {
  canHandle(handlerInput) { return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'; },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Welcome to Tidy-ish. You can ask me to add a task, like “wipe the worktops in the kitchen.”')
      .reprompt('Say “add a task” followed by the task. You can add a room, such as “in the kitchen.”')
      .getResponse();
  }
};

const AddTaskIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddTaskIntent';
  },
  async handle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const intent = request.intent;
    const accessToken = handlerInput.requestEnvelope.context?.System?.user?.accessToken;
    if (!accessToken) return accountLinkRequired(handlerInput);

    if (request.dialogState && request.dialogState !== 'COMPLETED') {
      return handlerInput.responseBuilder.addDelegateDirective().getResponse();
    }

    if (intent.confirmationStatus === 'DENIED') {
      clearPending(handlerInput);
      return handlerInput.responseBuilder.speak('Okay, I did not add that task.').withShouldEndSession(true).getResponse();
    }

    // Leave time for a response before Alexa's eight-second request limit.
    const requestSignal = AbortSignal.timeout(6000);
    try {
      if (intent.confirmationStatus === 'CONFIRMED') {
        const pending = handlerInput.attributesManager.getSessionAttributes().pendingTask;
        if (!pending?.taskId || !pending?.houseId) {
          return handlerInput.responseBuilder.speak('I lost the task details before confirmation. Please say the task again.').getResponse();
        }
        const saved = await saveNewTask(accessToken, pending.houseId, pending, requestSignal);
        clearPending(handlerInput);
        const action = saved.alreadyAdded ? 'is already on' : 'has been added to';
        return handlerInput.responseBuilder
          .speak(`${escapeSpeech(saved.title)} ${action} ${escapeSpeech(saved.roomName)} in Tidy-ish.`)
          .withShouldEndSession(true)
          .getResponse();
      }

      const command = Alexa.getSlotValue(handlerInput.requestEnvelope, 'TaskCommand');
      if (!command) {
        return handlerInput.responseBuilder
          .speak('What task should I add? You can include a room, like “wipe the worktops in the kitchen.”')
          .reprompt('Say the task, optionally followed by a room name.')
          .addElicitSlotDirective('TaskCommand', intent)
          .getResponse();
      }

      const current = await connectedHousehold(accessToken, requestSignal);
      const parsed = parseTaskCommand(command, current.boardModel);
      const duplicate = findExistingTask(current.boardModel, parsed.title, parsed.roomId, '');
      if (duplicate) {
        return handlerInput.responseBuilder
          .speak(`${escapeSpeech(duplicate.title)} is already on ${escapeSpeech(parsed.roomName)} in Tidy-ish.`)
          .withShouldEndSession(true)
          .getResponse();
      }

      const pending = {
        taskId: taskIdForRequest(request.requestId, current.house.id),
        houseId: current.house.id,
        title: parsed.title,
        roomId: parsed.roomId,
        roomName: parsed.roomName
      };
      handlerInput.attributesManager.setSessionAttributes({ pendingTask: pending });
      return handlerInput.responseBuilder
        .speak(`Should I add ${escapeSpeech(parsed.title)} to ${escapeSpeech(parsed.roomName)} in Tidy-ish?`)
        .reprompt('Please say yes to add it, or no to cancel.')
        .addConfirmIntentDirective(intent)
        .getResponse();
    } catch (error) {
      clearPending(handlerInput);
      if (error instanceof UserFacingError) {
        return handlerInput.responseBuilder.speak(escapeSpeech(error.message)).withShouldEndSession(true).getResponse();
      }
      if (error.status === 401) return accountLinkRequired(handlerInput);
      if (error instanceof IndeterminateSaveError) {
        return handlerInput.responseBuilder
          .speak('I could not confirm whether Tidy-ish saved that task. Please check the app before trying again.')
          .withShouldEndSession(true)
          .getResponse();
      }
      throw error;
    }
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Say “add” followed by a task. You can include a room, for example, “add wipe the worktops in the kitchen.” Without a room, I will use General. I will repeat it and ask you to confirm before saving.')
      .reprompt('What task would you like to add? You can include a room name.')
      .getResponse();
  }
};

const StopIntentHandler = {
  canHandle(handlerInput) {
    const type = Alexa.getRequestType(handlerInput.requestEnvelope);
    const name = type === 'IntentRequest' ? Alexa.getIntentName(handlerInput.requestEnvelope) : '';
    return type === 'SessionEndedRequest' || name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    clearPending(handlerInput);
    return handlerInput.responseBuilder.speak('Okay.').withShouldEndSession(true).getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('I can add a task to Tidy-ish. Say the task, and optionally include a room.')
      .reprompt('For example, “add wipe the worktops in the kitchen.” You can leave the room out to use General.')
      .getResponse();
  }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('Tidy-ish Alexa request failed:', error?.name || 'unknown error');
    return handlerInput.responseBuilder
      .speak('I could not reach your Tidy-ish household. Please try again later.')
      .withShouldEndSession(true)
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .withSkillId(process.env.ALEXA_SKILL_ID)
  .addRequestHandlers(
    LaunchRequestHandler,
    AddTaskIntentHandler,
    HelpIntentHandler,
    StopIntentHandler,
    FallbackIntentHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
