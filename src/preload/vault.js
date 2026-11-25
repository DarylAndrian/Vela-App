const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(`vault:${channel}`, ...args);
const listen = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('vault', {
  load: () => invoke('load'),
  connect: token => invoke('connect', token),
  save: (revision, vault) => invoke('save', revision, vault),
  disconnect: () => invoke('disconnect'),
  openWeb: () => invoke('open-web'),
  theme: () => invoke('theme'),
  copy: value => invoke('copy', value),
  clearClipboard: () => invoke('clear-clipboard'),
  onLock: callback => listen('vault:lock', callback),
  onInvalidated: callback => listen('vault:invalidated', callback),
  onTheme: callback => listen('service:state', value => { if (value?.type === 'theme:changed') callback(value.theme); }),
});
