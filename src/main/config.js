const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  velaBaseUrl: 'https://main.velagroup.my.id',
  velaIslandPath: '',
  velaZoomPath: '',
  theme: 'system',
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

module.exports = { DEFAULTS, configPath, load, save, resolveTool };
