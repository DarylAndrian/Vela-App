const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  listServices: () => ipcRenderer.invoke('services:list'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  openService: (id) => ipcRenderer.invoke('service:open', id),
  openNative: (page) => ipcRenderer.invoke('native:open', page),
  navBack: () => ipcRenderer.invoke('nav:back'),
  navHome: () => ipcRenderer.invoke('nav:home'),
  locate: (kind) => ipcRenderer.invoke('dialog:locate', kind),
  revealConfig: () => ipcRenderer.invoke('config:reveal'),
  onEvent: (cb) => ipcRenderer.on('service:state', (_e, payload) => cb(payload)),
  installer: {
    install: (id) => ipcRenderer.invoke('installer:install', id),
    cancel: (id) => ipcRenderer.invoke('installer:cancel', id),
    status: (id) => ipcRenderer.invoke('installer:status', id),
    onProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('installer:progress', listener);
      return () => ipcRenderer.removeListener('installer:progress', listener);
    },
  },
  media: {
    imageConvert: (req) => ipcRenderer.invoke('media:image-convert', req),
    imageCompress: (req) => ipcRenderer.invoke('media:image-compress', req),
    ffmpegProbe: () => ipcRenderer.invoke('media:ffmpeg-probe'),
    convert: (req) => ipcRenderer.invoke('media:convert', req),
    cancelJob: (jobId) => ipcRenderer.invoke('media:cancel-job', jobId),
    pickSave: (opts) => ipcRenderer.invoke('media:pick-save', opts),
    pickFolder: () => ipcRenderer.invoke('media:pick-folder'),
    reveal: (target) => ipcRenderer.invoke('media:reveal', target),
    ensureModels: (tier) => ipcRenderer.invoke('media:ensure-models', tier),
    modelsStatus: () => ipcRenderer.invoke('media:models-status'),
    onModelsProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('media:models-progress', listener);
      return () => ipcRenderer.removeListener('media:models-progress', listener);
    },
    onJobProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on('media:job-progress', listener);
      return () => ipcRenderer.removeListener('media:job-progress', listener);
    },
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
});

contextBridge.exposeInMainWorld('vela', {
  status: () => ipcRenderer.invoke('vela:status'),
  connect: (token) => ipcRenderer.invoke('vela:connect', token),
  disconnect: () => ipcRenderer.invoke('vela:disconnect'),
  openSite: () => ipcRenderer.invoke('vela:open-site'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  charts: {
    list: () => ipcRenderer.invoke('charts:list'),
    get: (id) => ipcRenderer.invoke('charts:get', id),
    create: (title, mmd_code) => ipcRenderer.invoke('charts:create', title, mmd_code),
    update: (id, changes) => ipcRenderer.invoke('charts:update', id, changes),
    delete: (id) => ipcRenderer.invoke('charts:delete', id),
  },
  files: {
    save: (defaultName, filters, dataBase64) => ipcRenderer.invoke('files:save', { defaultName, filters, dataBase64 }),
    openImages: () => ipcRenderer.invoke('files:open-images'),
  },
  clipboard: {
    writeImage: (pngBase64) => ipcRenderer.invoke('clipboard:write-image', pngBase64),
    writeText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  },
  onAuthExpired: (cb) => ipcRenderer.on('vela:auth-expired', () => cb()),
});
