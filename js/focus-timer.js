/* Tidy-ish: phone-clock timer bridge. Config belongs to this browser, not shared tasks.
   Automate Cloud HTTP no-cors cannot confirm alarm delivery. */
function addPhoneTimer(dialogElement, form) {
  const KEY = {
    secret: 'mc-phone-timer-automate-secret',
    account: 'mc-phone-timer-automate-account',
    device: 'mc-phone-timer-automate-device',
    phone: 'mc-phone-timer-platform',
    shortcut: 'mc-phone-timer-shortcut'
  };
  const ENDPOINT = 'https://llamalab.com/automate/cloud/message';
  const safeRead = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
  const safeWrite = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  const panel = document.createElement('section');
  panel.className = 'phone-timer-panel';
  panel.innerHTML = `
    <h3>Phone alarm timer</h3>
    <p class="phone-timer-hint">Choose minutes here. Your phone's Clock app sounds the alarm.</p>
    <div class="phone-timer-presets" aria-label="Quick durations">
      <button type="button" data-phone-preset="5">5 min</button>
      <button type="button" data-phone-preset="10">10 min</button>
      <button type="button" data-phone-preset="15">15 min</button>
      <button type="button" data-phone-preset="30">30 min</button>
    </div>
    <button type="button" class="phone-timer-start" data-phone-start>Start phone timer</button>
    <div data-phone-status role="status" aria-live="polite"></div>
    <details class="phone-timer-settings">
      <summary>Phone connection settings</summary>
      <label class="field">Phone type
        <select data-phone><option value="android">Android / Automate</option><option value="iphone">iPhone / Shortcuts</option></select>
      </label>
      <label class="field">Automate secret (stored on this device only)
        <input data-secret type="password" autocomplete="off" placeholder="Secret from your existing Automate flow">
      </label>
      <label class="field">Automate account email
        <input data-account type="email" inputmode="email" autocomplete="off" placeholder="Email used in Automate">
      </label>
      <label class="field">Automate device name
        <input data-device type="text" autocomplete="off" placeholder="Your phone's Automate device name">
      </label>
      <label class="field">iPhone shortcut name
        <input data-shortcut type="text" placeholder="House Timer">
      </label>
      <div class="phone-timer-config-actions"></div>
      <p class="phone-timer-caution">Connection values stay in this browser. Never put your secret in published code or a household backup.</p>
    </details>`;
  const host = form.querySelector?.('.dialog-body') || form;
  // Show Minutes before the phone controls. Do not cover existing stopwatch settings.
  if (typeof host.insertBefore === 'function' && host.children?.length) host.insertBefore(panel,host.children[1] || null);
  else if (typeof host.prepend === 'function') host.prepend(panel);

  const $ = selector => panel.querySelector(selector);
  const secret = $('[data-secret]');
  const account = $('[data-account]');
  const device = $('[data-device]');
  const platform = $('[data-phone]');
  const shortcut = $('[data-shortcut]');
  const settings = $('details');
  const start = $('[data-phone-start]');
  const status = $('[data-phone-status]');
  const storedPlatform = safeRead(KEY.phone);
  platform.value = storedPlatform || (/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iphone' : 'android');
  secret.value = safeRead(KEY.secret);
  account.value = safeRead(KEY.account);
  device.value = safeRead(KEY.device);
  shortcut.value = safeRead(KEY.shortcut) || 'House Timer';
  const initialShortcut = shortcut.value;
  const chosenMinutes = () => {
    const field = form.elements?.minutes;
    if (field?.reportValidity && !field.reportValidity()) return null;
    const minutes = Number(field?.value);
    return Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 && Number.isInteger(minutes)
      ? minutes : null;
  };
  const settingsFor = () => ({secret: secret.value.trim(), to: account.value.trim(), device: device.value.trim()});
  const show = message => { status.textContent = message; };
  const save = () => {
    const values = settingsFor();
    const ok = safeWrite(KEY.secret, values.secret) && safeWrite(KEY.account, values.to) &&
      safeWrite(KEY.device, values.device) && safeWrite(KEY.phone, platform.value) &&
      safeWrite(KEY.shortcut, shortcut.value.trim());
    show(ok ? 'Connection saved on this device.' : 'Cannot save connection: browser storage is unavailable.');
  };
  const paramsFor = seconds => new URLSearchParams({secret: settingsFor().secret,
    to: settingsFor().to, device: settingsFor().device, priority:'normal', payload:String(seconds)});
  const valid = () => {
    if (platform.value === 'iphone') return true;
    const s = settingsFor();
    if (s.secret && s.to && s.device) return true;
    settings.open = true;
    show('Enter your existing Automate secret, account and device first.');
    return false;
  };
  const send = async (seconds, test = false) => {
    if (!valid()) return;
    if (platform.value === 'iphone') {
      const typedName = shortcut.value.trim();
      const savedName = safeRead(KEY.shortcut).trim();
      const name = typedName !== initialShortcut ? typedName : (savedName || typedName || 'House Timer');
      window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(name) +
        '&input=text&text=' + encodeURIComponent(seconds);
      show('Check that your Clock timer started. The website cannot confirm it.');
      return;
    }
    start.disabled = true;
    try {
      await fetch(ENDPOINT, {
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:paramsFor(seconds)
      });
      // Opaque response means no delivery confirmation is possible.
      show(test ? 'Check your phone Clock for a 1-minute timer; delivery cannot be confirmed.' :
        'Timer request attempted. Check your phone Clock; delivery cannot be confirmed.');
    } catch (error) {
      show('Could not send the timer request. Check internet and Automate connection.');
    } finally { start.disabled = false; }
  };
  start.onclick = () => {
    const minutes = chosenMinutes();
    if (minutes === null) { show('Choose a whole number of minutes between 1 and 1440.'); return; }
    return send(minutes * 60);
  };
  for (const quick of panel.querySelectorAll?.('[data-phone-preset]') || []) {
    quick.onclick = () => {
      const field = form.elements?.minutes;
      if (field) field.value = quick.dataset.phonePreset;
    };
  }
  const addControl = (label, click) => {
    const control = document.createElement('button');
    control.type = 'button'; control.textContent = label; control.onclick = click;
    // Keep controls in the panel; the test harness supplies an inert created node.
    const target = panel.querySelector?.('.phone-timer-config-actions') || panel;
    if (typeof target.append === 'function') target.append(control);
    return control;
  };
  addControl('Save connection', save);
  addControl('Test 1-minute timer', () => send(60, true));
  addControl('Check connection response', () => {
    if (!valid()) return;
    if (platform.value !== 'android') { show('Connection response is only available for Android Automate.'); return; }
    const checkForm = document.createElement('form');
    checkForm.action = ENDPOINT;
    checkForm.method = 'POST';
    checkForm.enctype = 'application/x-www-form-urlencoded';
    checkForm.target = '_blank';
    checkForm.rel = 'noopener noreferrer';
    for (const [name, value] of paramsFor(60)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      checkForm.append(input);
    }
    document.body.append(checkForm);
    checkForm.submit();
    show('Opened Automate connection response in another tab; check it for an error. This does not confirm your phone alarm.');
    if (typeof setTimeout === 'function') setTimeout(() => checkForm.remove?.(), 0);
  });
}
window.TidyPhoneTimer = { addPhoneTimer };
