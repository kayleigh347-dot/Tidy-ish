/* Seasonal stage 1A: pure calendar helpers. No board, storage, UI or sync access.
 * All product policies are explicit arguments; no catalogue or automatic activation. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./schedule-core.js'));
  else root.TidySeasonal = factory(root.TidySchedule);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (schedule) {
  'use strict';
  if (!schedule || typeof schedule.parseDay !== 'function' || typeof schedule.addDays !== 'function')
    throw new Error('Seasonal date helpers require TidySchedule.');
  const object = (v, label) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('Invalid ' + label);
    return v;
  };
  const id = (v, label) => {
    if (typeof v !== 'string' || !v.trim() || v.trim() !== v) throw new TypeError('Invalid ' + label);
    return v;
  };
  const year = v => {
    if (!Number.isInteger(v) || v < 100 || v > 9999) throw new RangeError('Invalid calendar year');
    return v;
  };
  const day = v => {
    if (!schedule.parseDay(v)) throw new RangeError('Invalid date-only value');
    return v;
  };
  const integer = (v, label) => {
    if (!Number.isSafeInteger(v)) throw new RangeError('Invalid ' + label);
    return v;
  };
  function fixedDate(y, month, date, leapDayPolicy) {
    year(y);
    if (!Number.isInteger(month) || month < 1 || month > 12 ||
        !Number.isInteger(date) || date < 1 || date > 31)
      throw new RangeError('Invalid month/day');
    if (!['reject', 'feb28', 'mar1'].includes(leapDayPolicy))
      throw new RangeError('Explicit leap-day policy required');
    const iso = String(y).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(date).padStart(2, '0');
    if (schedule.parseDay(iso)) return iso;
    if (month === 2 && date === 29 && leapDayPolicy !== 'reject')
      return String(y).padStart(4, '0') + (leapDayPolicy === 'feb28' ? '-02-28' : '-03-01');
    throw new RangeError('Month/day does not exist in the target year');
  }
  function shiftDays(anchor, offset) {
    day(anchor);
    integer(offset, 'day offset');
    // Reject values outside the supported four-digit date domain, including overflow.
    if (Math.abs(offset) > 3652425) throw new RangeError('Day offset outside supported calendar');
    return day(schedule.addDays(anchor, offset));
  }
  // An opaque, unambiguous tuple, not a guessed board or task ID.
  function occurrenceKey(input) {
    object(input, 'occurrence identity');
    const templateId = id(input.templateId, 'template ID');
    if (input.recurrence === 'annual') {
      if (input.instanceId !== undefined) throw new TypeError('Annual identity cannot include instance ID');
      return JSON.stringify([templateId, 'annual', year(input.year)]);
    }
    if (input.recurrence === 'one-off') {
      if (input.year !== undefined) throw new TypeError('One-off identity cannot include year');
      return JSON.stringify([templateId, 'one-off', id(input.instanceId, 'instance ID')]);
    }
    throw new TypeError('Explicit recurrence required');
  }
  function eventDateFor(input) {
    const rule = object(input.eventRule, 'event rule');
    if (rule.kind === 'date') {
      const date = day(rule.date);
      if (input.recurrence === 'annual' && Number(date.slice(0,4)) !== input.year)
        throw new RangeError('Annual event date must match occurrence year');
      return date;
    }
    if (rule.kind === 'fixed' && input.recurrence === 'annual')
      return fixedDate(input.year, rule.month, rule.day, input.leapDayPolicy);
    throw new TypeError('Use an explicit date, or an annual fixed-date rule');
  }
  function boundaryDate(rule, anchor, leapDayPolicy) {
    object(rule, 'window rule');
    if (rule.kind === 'days') return shiftDays(anchor, rule.offset);
    if (rule.kind === 'date') return day(rule.date);
    if (rule.kind === 'fixed') {
      const y = Number(anchor.slice(0,4)) + integer(rule.yearOffset, 'year offset');
      return fixedDate(y, rule.month, rule.day, leapDayPolicy);
    }
    throw new TypeError('Unknown window rule');
  }
  function resolveOccurrence(input) {
    object(input, 'occurrence');
    const key = occurrenceKey(input);
    const eventDate = eventDateFor(input);
    const preparationStartDate = boundaryDate(input.preparationRule, eventDate, input.leapDayPolicy);
    const endDate = boundaryDate(input.endRule, eventDate, input.leapDayPolicy);
    if (preparationStartDate > eventDate || endDate < eventDate)
      throw new RangeError('Window must contain its event date');
    return { occurrenceKey: key, eventDate, preparationStartDate, endDate };
  }
  function isActive(window, date, policy) {
    object(window, 'occasion window');
    object(policy, 'boundary policy');
    day(date);
    const start = day(window.preparationStartDate), event = day(window.eventDate), end = day(window.endDate);
    if (start > event || end < event) throw new RangeError('Invalid occasion window');
    if (typeof policy.startInclusive !== 'boolean' || typeof policy.endInclusive !== 'boolean')
      throw new TypeError('Explicit start/end inclusion required');
    return (policy.startInclusive ? date >= start : date > start) &&
      (policy.endInclusive ? date <= end : date < end);
  }
  // Date-only lifecycle building blocks. The caller supplies the calendar
  // policy, and a recurring reference window (not an arbitrary year override).
  function daysBetween(from, to) {
    return Math.round((schedule.parseDay(day(to))-schedule.parseDay(day(from)))/86400000);
  }
  function windowOffsets(window) {
    object(window, 'occasion window');
    const event=day(window.eventDate), start=day(window.preparationStartDate), end=day(window.endDate);
    if(start>event||end<event) throw new RangeError('Invalid occasion window');
    return {preparationOffset:daysBetween(event,start),endOffset:daysBetween(event,end)};
  }
  function shiftWindow(window, eventDate) {
    const offsets=windowOffsets(window);
    return {eventDate:day(eventDate),preparationStartDate:shiftDays(eventDate,offsets.preparationOffset),endDate:shiftDays(eventDate,offsets.endOffset)};
  }
  function annualFromWindow(templateId, reference, targetYear, leapDayPolicy) {
    const offsets=windowOffsets(reference), event=reference.eventDate;
    return resolveOccurrence({templateId,recurrence:'annual',year:targetYear,leapDayPolicy,
      eventRule:{kind:'fixed',month:Number(event.slice(5,7)),day:Number(event.slice(8,10))},
      preparationRule:{kind:'days',offset:offsets.preparationOffset},endRule:{kind:'days',offset:offsets.endOffset}});
  }
  function windowPhase(window, date, policy) {
    if(isActive(window,date,policy)) return 'active';
    return date<=window.preparationStartDate?'upcoming':'ended';
  }
  function relativeTaskStart(window, offset) {
    windowOffsets(window);
    const start=shiftDays(window.eventDate,offset);
    if(start<window.preparationStartDate||start>window.endDate) throw new RangeError('Task start must be inside the occasion window');
    return start;
  }
  function novemberLastWeek(targetYear) {
    return {start:fixedDate(targetYear,11,24,'reject'),end:fixedDate(targetYear,11,30,'reject')};
  }
  return Object.freeze({ fixedDate, shiftDays, occurrenceKey, resolveOccurrence, isActive, daysBetween, windowOffsets, shiftWindow, annualFromWindow, windowPhase, relativeTaskStart, novemberLastWeek });
});
