const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  velaBaseUrl: 'https://main.velagroup.my.id',
  velaIslandPath: '',
  velaZoomPath: '',
  theme: 'system',
  velaIslandSettings: {
    widgets: { media: true, clock: true, shelf: true, todos: true },
    hotkey: 'Ctrl+Alt+I',
    opacity: 90,
    position: 'top-right',
  },
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(cfg) {
  const { configPath: _drop, ...clean } = cfg;
  const merged = { ...DEFAULTS, ...clean };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function resolveTool(cfg, key, candidates) {
  const list = [cfg[key], ...(candidates || [])].filter(Boolean);
  return list.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || null;
}

function islandSettings(cfg) {
  const saved = (cfg && cfg.velaIslandSettings) || {};
  return {
    ...DEFAULTS.velaIslandSettings,
    ...saved,
    widgets: { ...DEFAULTS.velaIslandSettings.widgets, ...(saved.widgets || {}) },
  };
}

module.exports = { DEFAULTS, configPath, load, save, resolveTool, islandSettings };
