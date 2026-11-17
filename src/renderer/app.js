const ICONS = {
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pictures: '<rect x="3" y="5" width="10" height="10" rx="2"/><rect x="11" y="9" width="10" height="10" rx="2"/><path d="M7 12l2 2 3-4"/>',
  convert: '<path d="M8 4L4 8l4 4"/><path d="M4 8h12a4 4 0 0 1 0 8h-2"/><path d="M16 20l4-4-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="M8 15h3M13 15h3"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="12" cy="14" r="2.5"/><path d="M8 14h1.5M14.5 14H16"/>',
  island: '<rect x="5" y="8" width="14" height="8" rx="4"/><path d="M9 12h.01M15 12h.01"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M21 21l-5-5"/><path d="M8 10.5h5M10.5 8v5"/>',
};

const BADGE_LABELS = {
  'available': 'Available',
  'loading': 'Loading…',
  'coming-soon': 'Coming soon',
  'unavailable': 'Not installed',
  'needs-config': 'Set Vela URL',
  'error': 'Error',
  'running': 'Running',
  'installing': 'Installing…',
};

const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>';

const $ = (id) => document.getElementById(id);
const grid = $('cardGrid');

let services = [];
let cfg = { theme: 'system' };
let lastFailedId = null;
let toastTimer = null;

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

/* ---------- Theme ---------- */
function applyTheme(choice) {
  const resolved = choice === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : choice;
  document.documentElement.dataset.theme = resolved;
  $('themeIcon').innerHTML = resolved === 'light' ? SUN : MOON;
  document.querySelectorAll('#appearanceChips .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.themeChoice === choice));
  cfg.theme = choice;
}

async function setTheme(choice) {
  applyTheme(choice);
  cfg = await window.launcher.saveConfig({ ...cfg, theme: choice });
}

/* ---------- Cards ---------- */
function renderCards() {
  grid.innerHTML = '';
  services.forEach((svc) => {
    const state = svc.state;
    const el = document.createElement('div');
    el.className = 'card';
    el.tabIndex = 0;
    el.dataset.state = state;
    el.dataset.id = svc.id;
    el.style.setProperty('--cat', `var(--cat-${svc.category})`);

    const actions = state === 'unavailable'
      ? `<div class="card-actions">
           <button class="card-action primary-action" data-action="install">Install</button>
           <button class="card-action secondary-action" data-action="locate">Locate file…</button>
         </div>`
      : state === 'needs-config'
        ? `<button class="card-action" data-action="settings">Open Settings</button>` : '';

    el.innerHTML = `
      <div class="card-top">
        <div class="card-icon"><svg viewBox="0 0 24 24">${ICONS[svc.icon] || ''}</svg></div>
        <span class="badge ${state}"><span class="dot"></span>${BADGE_LABELS[state]}</span>
      </div>
      <h2>${svc.name}</h2>
      <p>${svc.description}</p>
      <div class="card-meta"><span class="card-kind">${svc.kindLabel}</span></div>
      ${actions}
    `;

    el.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('.card-action');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        if (action === 'settings') openSettings();
        else if (action === 'locate') locateFor(svc);
        else if (action === 'install') startInstall(svc);
        return;
      }
      onCardClick(svc);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(svc); }
    });
    grid.appendChild(el);
  });
}

function setCardState(id, state) {
  const svc = services.find((s) => s.id === id);
  if (svc) svc.state = state;
  const el = grid.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.dataset.state = state;
  const badge = el.querySelector('.badge');
  badge.className = `badge ${state}`;
  badge.innerHTML = `<span class="dot"></span>${BADGE_LABELS[state] || state}`;
}

function onCardClick(svc) {
  switch (svc.state) {
    case 'coming-soon':
      toast(`${svc.name} is coming soon`);
      return;
    case 'needs-config':
      openSettings();
      return;
    case 'unavailable':
      startInstall(svc);
      return;
    case 'installing':
      return;
    case 'running':
      toast(`${svc.name} is already running`);
      if (svc.id === 'velaisland') openIslandSettings(true);
      else if (GUIDES[svc.id]) openGuide(svc.id);
      return;
    default:
      hideError();
      if (svc.id === 'velaisland') {
        openIslandSettings(false);
        return;
      }
      window.launcher.openService(svc.id);
      if (GUIDES[svc.id]) openGuide(svc.id);
  }
}

async function locateFor(svc) {
  const key = svc.exeKey;
  const picked = await window.launcher.locate(key);
  if (!picked) return;
  cfg = await window.launcher.saveConfig({ ...cfg, [key]: picked });
  await refresh();
  toast('Saved to settings');
}

async function refresh() {
  [services, cfg] = await Promise.all([window.launcher.listServices(), window.launcher.getConfig()]);
  applyTheme(cfg.theme || 'system');
  renderCards();
  refreshAuth();
}

/* ---------- Install flow ---------- */
let currentInstallSvc = null;

function fmtMB(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function closeInstall() {
  $('installModal').classList.remove('visible');
  currentInstallSvc = null;
}

async function startInstall(svc) {
  currentInstallSvc = svc;
  setCardState(svc.id, 'installing');
  $('installTitle').textContent = `Installing ${svc.name}`;
  $('installNote').textContent = 'Downloading the installer…';
  $('installBytes').textContent = '';
  $('installProgressFill').style.width = '0%';
  $('installRetry').hidden = true;
  $('installCancel').textContent = 'Cancel';
  $('installModal').classList.add('visible');

  const result = await window.launcher.installer.install(svc.id);
  if (!currentInstallSvc || currentInstallSvc.id !== svc.id) return;

  if (result && result.ok && result.phase === 'done') {
    closeInstall();
    await refresh();
    const after = services.find((s) => s.id === svc.id);
    if (after && after.state === 'unavailable') {
      toast(`${svc.name} was installed, but the app wasn't found — use “Locate file…” to point to it.`);
      return;
    }
    toast(`${svc.name} installed`);
    if (svc.id === 'velazoom') openGuide('velazoom');
    else if (svc.id === 'velaisland') openIslandSettings(false);
    return;
  }
  if (result && result.phase === 'canceled') {
    closeInstall();
    setCardState(svc.id, 'unavailable');
    return;
  }
  $('installNote').textContent = (result && result.error) || 'Installation failed.';
  $('installRetry').hidden = false;
  $('installCancel').textContent = 'Close';
  setCardState(svc.id, 'unavailable');
}

window.launcher.installer.onProgress((ev) => {
  if (!currentInstallSvc || ev.id !== currentInstallSvc.id) return;
  if (ev.phase === 'downloading') {
    const ratio = ev.total > 0 ? Math.min(1, ev.downloaded / ev.total) : 0;
    $('installProgressFill').style.width = `${Math.round(ratio * 100)}%`;
    $('installBytes').textContent = ev.total > 0
      ? `${fmtMB(ev.downloaded)} of ${fmtMB(ev.total)}`
      : fmtMB(ev.downloaded);
    $('installNote').textContent = 'Downloading the installer…';
  } else if (ev.phase === 'running-installer') {
    $('installProgressFill').style.width = '100%';
    $('installBytes').textContent = '';
    $('installNote').textContent = 'Follow the setup wizard to finish installing, then come back here.';
  }
});

/* ---------- Guides (VelaZoom) ---------- */
let currentGuideId = null;
const GUIDES = {
  velazoom: {
    title: 'How to use VelaZoom',
    sub: 'Screen zoom & annotation — quick start.',
    steps: [
      ['1', 'Zoom in / out — Ctrl + Scroll', 'Move the magnifier over any part of the screen; scroll to change the zoom level.'],
      ['2', 'Freeze frame — Ctrl + Shift + F', 'Pause the screen so you can zoom and annotate a still image.'],
      ['3', 'Spotlight — Ctrl + Shift + S', 'Dim everything except a spotlight around the cursor.'],
      ['4', 'Magnifier — Ctrl + Shift + M', 'Open a docked magnifier pane for precision pointing.'],
      ['5', 'Annotate & export — Ctrl + Shift + E', 'Draw arrows and boxes on a frozen frame, then copy or save it.'],
    ],
  },
};

function openGuide(id) {
  const guide = GUIDES[id];
  if (!guide) return;
  currentGuideId = id;
  $('guideTitle').textContent = guide.title;
  $('guideSub').textContent = guide.sub;
  $('guideSteps').innerHTML = guide.steps.map(([num, title, sub]) => `
    <div class="guide-step">
      <div class="num">${num}</div>
      <div><div class="step-title">${title}</div><div class="step-sub">${sub}</div></div>
    </div>
  `).join('');
  $('guideModal').classList.add('visible');
}

function closeGuide() {
  $('guideModal').classList.remove('visible');
}

/* ---------- VelaIsland settings ---------- */
const ISLAND_DEFAULTS = {
  widgets: { media: true, clock: true, shelf: true, todos: true },
  hotkey: 'Ctrl+Alt+I',
  opacity: 90,
  position: 'top-right',
};

function islandSettingsFromCfg() {
  const saved = cfg.velaIslandSettings || {};
  return {
    ...ISLAND_DEFAULTS,
    ...saved,
    widgets: { ...ISLAND_DEFAULTS.widgets, ...(saved.widgets || {}) },
  };
}

function setToggle(id, on) {
  $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
}

function toggleOn(id) {
  return $(id).getAttribute('aria-pressed') === 'true';
}

function openIslandSettings(running) {
  const s = islandSettingsFromCfg();
  setToggle('islWidgetMedia', s.widgets.media);
  setToggle('islWidgetClock', s.widgets.clock);
  setToggle('islWidgetShelf', s.widgets.shelf);
  setToggle('islWidgetTodos', s.widgets.todos);
  $('islHotkey').value = s.hotkey;
  $('islOpacity').value = s.opacity;
  $('islOpacityVal').textContent = `${s.opacity}%`;
  $('islPositionChips').querySelectorAll('.chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.position === s.position));
  $('islandSub').textContent = running
    ? 'VelaIsland is running — changes apply after it restarts.'
    : 'Applied each time VelaIsland starts from the Vela launcher.';
  $('islandModal').classList.add('visible');
}

function closeIslandSettings() {
  $('islandModal').classList.remove('visible');
}

function collectIslandSettings() {
  const activeChip = $('islPositionChips').querySelector('.chip.active');
  return {
    widgets: {
      media: toggleOn('islWidgetMedia'),
      clock: toggleOn('islWidgetClock'),
      shelf: toggleOn('islWidgetShelf'),
      todos: toggleOn('islWidgetTodos'),
    },
    hotkey: $('islHotkey').value.trim() || ISLAND_DEFAULTS.hotkey,
    opacity: Number($('islOpacity').value) || ISLAND_DEFAULTS.opacity,
    position: activeChip ? activeChip.dataset.position : ISLAND_DEFAULTS.position,
  };
}

async function saveIslandSettingsAndLaunch() {
  cfg = await window.launcher.saveConfig({ ...cfg, velaIslandSettings: collectIslandSettings() });
  closeIslandSettings();
  window.launcher.openService('velaisland');
  toast('Settings saved — starting VelaIsland');
}

/* ---------- Account / sign in ---------- */
async function refreshAuth() {
  try {
    const st = await window.vela.status();
    const chip = $('accountChip');
    const btn = $('signInBtn');
    if (st.connected && st.identity) {
      $('accountAvatar').textContent = st.identity.username.slice(0, 1).toUpperCase();
      $('accountName').textContent = st.identity.username;
      $('accountState').textContent = st.daysRemaining !== null
        ? `Connected · ${st.daysRemaining} days left` : 'Connected';
      chip.classList.add('visible');
      btn.style.display = 'none';
    } else {
      chip.classList.remove('visible');
      btn.style.display = '';
    }
  } catch {
    /* keep current state */
  }
}

/* ---------- Service mode / toolbar ---------- */
function enterServiceMode(id, url) {
  const svc = services.find((s) => s.id === id);
  $('appHeader').classList.add('hidden');
  $('homeScroll').classList.add('hidden');
  $('serviceTop').classList.add('visible');
  $('svcTitle').textContent = svc ? svc.name : '';
  $('svcUrl').textContent = url === 'native' ? 'Built-in — runs on this PC' : (url || '');
  setProgress(30, true);
}

function exitServiceMode() {
  $('serviceTop').classList.remove('visible');
  $('appHeader').classList.remove('hidden');
  $('homeScroll').classList.remove('hidden');
  setProgress(0, false);
}

function setProgress(width, visible) {
  const bar = $('progressBar');
  bar.style.opacity = visible ? '1' : '0';
  bar.style.width = `${width}%`;
}

function showError(message, id) {
  lastFailedId = id || null;
  exitServiceMode();
  $('errorTitle').textContent = "Couldn't reach the service";
  $('errorMessage').textContent = message || 'Unknown error.';
  $('errorPanel').classList.add('visible');
}

function hideError() {
  $('errorPanel').classList.remove('visible');
  lastFailedId = null;
}

/* ---------- Events from main ---------- */
window.launcher.onEvent((ev) => {
  switch (ev.type) {
    case 'opened':
      enterServiceMode(ev.id, ev.url);
      break;
    case 'loading':
      setProgress(65, true);
      break;
    case 'loaded':
      setProgress(100, true);
      setTimeout(() => setProgress(0, false), 400);
      break;
    case 'home':
      exitServiceMode();
      break;
    case 'failed':
      showError(ev.message, ev.id);
      break;
    case 'needs-config':
      openSettings();
      toast('Set the Vela site URL in Settings first');
      break;
    case 'running': {
      setCardState(ev.id, 'running');
      const svc = services.find((s) => s.id === ev.id);
      toast(`${svc ? svc.name : 'App'} launched`);
      break;
    }
    case 'already-running': {
      setCardState(ev.id, 'running');
      const svc = services.find((s) => s.id === ev.id);
      toast(`${svc ? svc.name : 'App'} is already running`);
      break;
    }
    case 'not-found':
      toast(ev.message || 'Not found');
      refresh();
      break;
    case 'services:refresh':
      refresh();
      break;
  }
});
window.vela.onAuthExpired(() => refreshAuth());

/* ---------- Settings ---------- */
function openSettings() {
  $('cfgVelaBaseUrl').value = cfg.velaBaseUrl || '';
  $('cfgVelaIslandPath').value = cfg.velaIslandPath || '';
  $('cfgVelaZoomPath').value = cfg.velaZoomPath || '';
  $('configPathText').textContent = `Config: ${cfg.configPath || ''}`;
  applyTheme(cfg.theme || 'system');
  $('settingsModal').classList.add('visible');
}

function closeSettings() {
  $('settingsModal').classList.remove('visible');
}

async function saveSettings() {
  cfg = await window.launcher.saveConfig({
    ...cfg,
    velaBaseUrl: $('cfgVelaBaseUrl').value.trim(),
    velaIslandPath: $('cfgVelaIslandPath').value.trim(),
    velaZoomPath: $('cfgVelaZoomPath').value.trim(),
    theme: cfg.theme,
  });
  closeSettings();
  await refresh();
  toast('Settings saved');
}

/* ---------- Wire up ---------- */
$('themeBtn').addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  setTheme(isDark ? 'light' : 'dark');
});
$('settingsBtn').addEventListener('click', openSettings);
$('settingsCancel').addEventListener('click', closeSettings);
$('settingsSave').addEventListener('click', saveSettings);
$('settingsModal').addEventListener('click', (e) => {
  if (e.target === $('settingsModal')) closeSettings();
});
$('backBtn').addEventListener('click', () => window.launcher.navBack());
$('homeBtn').addEventListener('click', () => window.launcher.navHome());
$('signInBtn').addEventListener('click', () => window.launcher.openNative('connect.html'));
$('accountChip').addEventListener('click', () => window.launcher.openNative('connect.html'));
$('errorRetry').addEventListener('click', () => {
  hideError();
  if (lastFailedId) window.launcher.openService(lastFailedId);
});
$('errorSettings').addEventListener('click', openSettings);
$('revealConfig').addEventListener('click', () => window.launcher.revealConfig());

$('installRetry').addEventListener('click', () => {
  if (currentInstallSvc) startInstall(currentInstallSvc);
});
$('installCancel').addEventListener('click', () => {
  if (currentInstallSvc) {
    window.launcher.installer.cancel(currentInstallSvc.id);
    setCardState(currentInstallSvc.id, 'unavailable');
  }
  closeInstall();
});
$('installLocate').addEventListener('click', () => {
  const svc = currentInstallSvc;
  if (svc) {
    window.launcher.installer.cancel(svc.id);
    setCardState(svc.id, 'unavailable');
  }
  closeInstall();
  if (svc) locateFor(svc);
});
$('installModal').addEventListener('click', (e) => {
  if (e.target === $('installModal')) $('installCancel').click();
});

$('guideClose').addEventListener('click', closeGuide);
$('guideLaunch').addEventListener('click', () => {
  if (currentGuideId) window.launcher.openService(currentGuideId);
});
$('guideModal').addEventListener('click', (e) => {
  if (e.target === $('guideModal')) closeGuide();
});

$('islandCancel').addEventListener('click', closeIslandSettings);
$('islandSaveLaunch').addEventListener('click', saveIslandSettingsAndLaunch);
$('islandModal').addEventListener('click', (e) => {
  if (e.target === $('islandModal')) {
    closeIslandSettings();
    return;
  }
  if (e.target.classList.contains('toggle')) {
    setToggle(e.target.id, !toggleOn(e.target.id));
    return;
  }
  const chip = e.target.closest('#islPositionChips .chip');
  if (chip) {
    $('islPositionChips').querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
  }
});
$('islOpacity').addEventListener('input', () => {
  $('islOpacityVal').textContent = `${$('islOpacity').value}%`;
});

document.querySelectorAll('[data-locate]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const key = btn.dataset.locate;
    const picked = await window.launcher.locate(key);
    if (picked) $(`cfg${key.charAt(0).toUpperCase()}${key.slice(1)}`).value = picked;
  });
});

$('appearanceChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) applyTheme(chip.dataset.themeChoice);
});

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (cfg.theme === 'system') applyTheme('system');
});

refresh();
