const ICONS = {
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pictures: '<rect x="3" y="5" width="10" height="10" rx="2"/><rect x="11" y="9" width="10" height="10" rx="2"/><path d="M7 12l2 2 3-4"/>',
  convert: '<path d="M8 4L4 8l4 4"/><path d="M4 8h12a4 4 0 0 1 0 8h-2"/><path d="M16 20l4-4-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="M8 15h3M13 15h3"/>',
  macro: '<path d="M9 3v2M6.16 6.16 4.74 4.74M5 9H3m6 4v2m4-6h2m-8.84 2.84-1.42 1.42m8.52-8.52-1.42 1.42M10 10l4 11 1.8-5.2L21 14Z"/>',
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

const $ = (id) => document.getElementById(id);
const grid = $('cardGrid');

let services = [];
let cfg = { theme: 'system' };
let lastFailedId = null;
let toastTimer = null;
let destination = 'home';
let activeViewId = null;
let mediaActivity = 0;
let macroActive = false;
let draftTheme = 'system';

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
  document.querySelectorAll('#appearanceChips .chip').forEach((chip) => {
    const selected = chip.dataset.themeChoice === choice;
    chip.classList.toggle('active', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('#themeSwitcher .theme-btn').forEach((btn) => {
    const selected = btn.dataset.themeQuick === choice;
    btn.setAttribute('aria-pressed', String(selected));
  });
}

/* ---------- Destinations and launcher ---------- */
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function renderNav() {
  const nav = $('toolNav');
  const focused = document.activeElement?.dataset.destination;
  nav.replaceChildren(...services.filter((svc) => svc.kind === 'native').map((svc) => {
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.type = 'button';
    button.dataset.destination = svc.id;
    const label = svc.id === 'velapt' ? 'Photo to PDF' : svc.name;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `${icon(svc.icon)}<span class="rail-label">${label}</span>`;
    if (svc.id === 'media-converter' || svc.id === 'macro') {
      button.insertAdjacentHTML('beforeend', '<span class="nav-activity" hidden aria-hidden="true"></span>');
    }
    button.addEventListener('click', () => window.launcher.openService(svc.id));
    return button;
  }));
  selectNav(destination);
  updateMediaActivity(mediaActivity);
  updateMacroActivity(macroActive);
  if (focused) nav.querySelector(`[data-destination="${focused}"]`)?.focus();
}

function selectNav(id) {
  document.querySelectorAll('[data-destination]').forEach((button) => {
    if (button.dataset.destination === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function updateMacroActivity(active) {
  macroActive = active;
  const button = $('toolNav').querySelector('[data-destination="macro"]');
  if (!button) return;
  const label = active ? 'Macro Recorder · Active' : 'Macro Recorder';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.querySelector('.nav-activity').hidden = !active;
}

function updateMediaActivity(count) {
  mediaActivity = count;
  const button = $('toolNav').querySelector('[data-destination="media-converter"]');
  if (!button) return;
  const label = count ? `Media Converter · ${count} active ${count === 1 ? 'job' : 'jobs'}` : 'Media Converter';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.querySelector('.nav-activity').hidden = count === 0;
}

function renderCards() {
  grid.replaceChildren();
  for (const [kind, heading] of [['native', 'Built-in tools'], ['external', 'Windows apps']]) {
    const section = document.createElement('section');
    section.className = 'launcher-section';
    section.innerHTML = `<h2>${heading}</h2><div class="launcher-list"></div>`;

    for (const svc of services.filter((item) => item.kind === kind)) {
      const card = document.createElement('div');
      card.className = 'launcher-card';
      card.dataset.id = svc.id;
      card.innerHTML = `
        <div class="launcher-card-main">
          <span class="launcher-icon">${icon(svc.icon)}</span>
          <div class="launcher-description">
            <div class="launcher-title-row">
              <h3>${svc.name}</h3>
              <span class="badge"></span>
            </div>
            <p>${svc.description}</p>
          </div>
          <span class="launcher-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </div>
        <div class="launcher-actions"></div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (card.dataset.interactive === 'true') onCardClick(svc);
      });
      card.addEventListener('keydown', (e) => {
        if (e.target !== card || card.dataset.interactive !== 'true') return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick(svc);
        }
      });
      syncCard(card, svc);
      section.querySelector('.launcher-list').appendChild(card);
    }
    grid.appendChild(section);
  }
}

function syncCard(card, svc) {
  card.dataset.state = svc.state;
  const interactive = !['unavailable', 'installing', 'coming-soon'].includes(svc.state);
  card.dataset.interactive = String(interactive);
  if (interactive) {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const verb = svc.state === 'needs-config' ? 'Configure' : 'Open';
    card.setAttribute('aria-label', `${verb} ${svc.name}`);
  } else {
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    card.removeAttribute('aria-label');
  }

  const badge = card.querySelector('.badge');
  const showState = svc.kind === 'external' && svc.state !== 'available';
  badge.hidden = !showState;
  badge.className = `badge ${svc.state}`;
  badge.textContent = BADGE_LABELS[svc.state] || '';

  card.querySelector('.launcher-arrow').hidden = !interactive;

  const actions = card.querySelector('.launcher-actions');
  if (svc.state === 'unavailable') {
    const items = [['Install', () => startInstall(svc)], ['Locate…', () => locateFor(svc)]];
    actions.replaceChildren(...items.map(([label, action]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.textContent = label;
      button.setAttribute('aria-label', `${label} ${svc.name}`);
      button.addEventListener('click', action);
      return button;
    }));
    actions.hidden = false;
  } else {
    actions.replaceChildren();
    actions.hidden = true;
  }
}

function setCardState(id, state) {
  const svc = services.find((item) => item.id === id);
  const card = grid.querySelector(`[data-id="${id}"]`);
  if (!svc || !card) return;
  svc.state = state;
  syncCard(card, svc);
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
  renderNav();
  renderCards();
  void refreshAuth();
}

/* ---------- Companion-app dialogs ---------- */
const modalTriggers = new Map();

function showModal(id) {
  const modal = $(id);
  if (modal.classList.contains('visible')) return;
  modalTriggers.set(id, document.activeElement);
  modal.classList.add('visible');
  document.querySelector('.desktop').inert = true;
  modal.querySelector('button:not([hidden]):not([disabled])')?.focus();
}

function dismissModal(id) {
  const modal = $(id);
  if (!modal.classList.contains('visible')) return;
  modal.classList.remove('visible');
  document.querySelector('.desktop').inert = false;
  const trigger = modalTriggers.get(id);
  modalTriggers.delete(id);
  (trigger?.isConnected && trigger !== document.body ? trigger :
    document.querySelector('[data-destination][aria-current="page"]'))?.focus();
}

document.addEventListener('keydown', (event) => {
  const modal = document.querySelector('.modal-backdrop.visible');
  if (!modal) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    modal.querySelector('[data-dismiss]')?.click();
  } else if (event.key === 'Tab') {
    const controls = [...modal.querySelectorAll('button, input')].filter((el) => !el.hidden && !el.disabled);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});

/* ---------- Install flow ---------- */
let currentInstallSvc = null;

function fmtMB(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function closeInstall() {
  dismissModal('installModal');
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
  showModal('installModal');

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
  showModal('guideModal');
}

function closeGuide() {
  dismissModal('guideModal');
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
  showModal('islandModal');
}

function closeIslandSettings() {
  dismissModal('islandModal');
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

/* ---------- Workspace host ---------- */
async function refreshAuth() {
  try {
    const status = await window.vela.status();
    $('accountState').textContent = status.connected && status.identity
      ? `Signed in as ${status.identity.username}` : 'Signed out';
  } catch {
    $('accountState').textContent = 'Connection status unavailable';
  }
}

function hideError() {
  $('errorPanel').hidden = true;
  lastFailedId = null;
}

function showDestination(id, title) {
  destination = id;
  if (id !== 'settings' || activeViewId) applyTheme(cfg.theme || 'system');
  $('workspaceTitle').textContent = title;
  $('homeScroll').hidden = id !== 'home';
  $('settingsPanel').hidden = id !== 'settings' || activeViewId !== null;
  $('workspaceLoading').hidden = true;
  $('errorPanel').hidden = true;
  selectNav(id);
}

function syncWorkspaceBounds() {
  const { x, y } = $('workspaceArea').getBoundingClientRect();
  window.launcher.setWorkspaceBounds({ x: Math.round(x), y: Math.round(y) });
}
new ResizeObserver(syncWorkspaceBounds).observe($('workspaceArea'));
syncWorkspaceBounds();

window.launcher.onEvent((ev) => {
  switch (ev.type) {
    case 'opened': {
      activeViewId = ev.id;
      const svc = services.find((item) => item.id === ev.id);
      showDestination(ev.id === 'connect' ? 'settings' : ev.id, ev.id === 'connect' ? 'Vela account' :
        svc?.id === 'velapt' ? 'Photo to PDF' : svc?.name || 'Workspace');
      $('workspaceLoading').hidden = !ev.loading;
      break;
    }
    case 'loaded':
      if (ev.id === activeViewId) $('workspaceLoading').hidden = true;
      break;
    case 'shell':
      activeViewId = null;
      showDestination(ev.destination, ev.destination === 'settings' ? 'Settings' : 'Home');
      if (ev.destination === 'settings') populateSettings();
      break;
    case 'failed':
      if (ev.id !== activeViewId) break;
      activeViewId = null;
      lastFailedId = ev.id;
      $('workspaceLoading').hidden = true;
      $('errorMessage').textContent = ev.message;
      $('errorPanel').hidden = false;
      break;
    case 'focus-navigation':
      document.querySelector('[data-destination][aria-current="page"]')?.focus();
      break;
    case 'account-changed':
      void refreshAuth();
      break;
    case 'media-activity':
      updateMediaActivity(ev.count);
      break;
    case 'macro:activity':
      updateMacroActivity(ev.active);
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

/* ---------- Settings ---------- */
function openSettings() {
  void window.launcher.showWorkspace('settings');
}

function populateSettings() {
  $('cfgVelaBaseUrl').value = cfg.velaBaseUrl || '';
  $('cfgVelaIslandPath').value = cfg.velaIslandPath || '';
  $('cfgVelaZoomPath').value = cfg.velaZoomPath || '';
  $('configPathText').textContent = cfg.configPath || '';
  draftTheme = cfg.theme || 'system';
  applyTheme(draftTheme);
}

async function saveSettings() {
  cfg = await window.launcher.saveConfig({
    ...cfg,
    velaBaseUrl: $('cfgVelaBaseUrl').value.trim(),
    velaIslandPath: $('cfgVelaIslandPath').value.trim(),
    velaZoomPath: $('cfgVelaZoomPath').value.trim(),
    theme: draftTheme,
  });
  await refresh();
  populateSettings();
  toast('Settings saved');
}

/* ---------- Wire up ---------- */
$('settingsBtn').addEventListener('click', openSettings);
$('settingsCancel').addEventListener('click', populateSettings);
$('settingsSave').addEventListener('click', saveSettings);
$('homeBtn').addEventListener('click', () => window.launcher.showWorkspace('home'));
$('accountBtn').addEventListener('click', () => window.launcher.showWorkspace('account'));
$('errorRetry').addEventListener('click', () => {
  const failed = lastFailedId;
  hideError();
  if (failed === 'connect') void window.launcher.showWorkspace('account');
  else if (failed) void window.launcher.openService(failed);
});
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
  if (!chip) return;
  draftTheme = chip.dataset.themeChoice;
  applyTheme(draftTheme);
});

let themeSaveSeq = 0;
$('themeSwitcher').addEventListener('click', async (e) => {
  const btn = e.target.closest('.theme-btn');
  if (!btn) return;
  const choice = btn.dataset.themeQuick;
  if (!choice) return;
  const seq = ++themeSaveSeq;
  draftTheme = choice;
  applyTheme(choice);
  const base = cfg.configPath ? cfg : await window.launcher.getConfig();
  const saved = await window.launcher.saveConfig({ ...base, theme: choice });
  if (seq === themeSaveSeq) cfg = { ...base, ...saved };
});

window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  const choice = destination === 'settings' && activeViewId === null ? draftTheme : cfg.theme;
  if (choice === 'system') applyTheme('system');
});

refresh();
