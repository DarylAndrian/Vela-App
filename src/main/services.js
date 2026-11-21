const config = require('./config');

const SERVICES = [
  {
    id: 'chart-code',
    name: 'Chart Code Generator',
    description: 'Generate Mermaid chart code with AI and manage your chart library.',
    kind: 'native',
    category: 'web',
    kindLabel: 'Built-in',
    page: 'chart-code.html',
    needsAuth: true,
    icon: 'chart',
  },
  {
    id: 'picture-connector',
    name: 'Picture Connector',
    description: 'Merge and annotate screenshots — stitch images with arrows and labels.',
    kind: 'native',
    category: 'web',
    kindLabel: 'Built-in',
    page: 'picture-connector.html',
    icon: 'pictures',
  },
  {
    id: 'media-converter',
    name: 'Media Converter',
    description: 'Convert, compress and edit images, audio and video — fully on your computer.',
    kind: 'native',
    category: 'local',
    kindLabel: 'Built-in',
    page: 'media-converter.html',
    icon: 'convert',
  },
  {
    id: 'taiwan-year',
    name: 'Taiwan Year Calculator',
    description: 'Convert between 民國 (ROC) calendar years and the Western calendar — fully offline.',
    kind: 'native',
    category: 'local',
    kindLabel: 'Built-in',
    page: 'taiwan-year.html',
    icon: 'calendar',
  },
  {
    id: 'macro',
    name: 'Macro Recorder',
    description: 'Record clicks, scrolling and keystrokes, then replay them on Windows.',
    kind: 'native',
    category: 'local',
    kindLabel: 'Built-in',
    page: 'macro.html',
    icon: 'macro',
  },
  {
    id: 'velapt',
    name: 'VelaPTP — Photo to PDF',
    description: 'Photo to PDF Studio: perspective crop, scan enhancement, page layout.',
    kind: 'native',
    category: 'web',
    kindLabel: 'Built-in',
    page: 'velapt.html',
    icon: 'pdf',
  },
  {
    id: 'velaisland',
    name: 'VelaIsland',
    description: 'Windows desktop overlay: media now-playing, clock, shelf, todos and more.',
    kind: 'external',
    category: 'win',
    kindLabel: 'Windows app',
    icon: 'island',
    exeKey: 'velaIslandPath',
    exeName: 'VelaDynamic.exe',
    candidates: [
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Vela Island\\VelaDynamic.exe`,
      'D:\\ai-and-code\\VelaIsland\\artifacts\\publish\\VelaDynamic.exe',
    ].filter(Boolean),
    skipIfRunning: false,
    installer: {
      url: 'https://vela.example.com/installers/VelaIsland-Setup.exe',
      fileName: 'VelaIsland-Setup.exe',
    },
    // CLI contract with VelaIsland: GNU-style long flags, one argv element per
    // flag, booleans as literal on|off; --position in
    // top-left|top-right|bottom-left|bottom-right; --opacity 40-100; --hotkey a
    // +-joined chord. VelaIsland must ignore unknown flags and use its own
    // defaults for missing ones so older builds stay launchable.
    buildArgs: (cfg) => {
      const s = config.islandSettings(cfg);
      const onOff = (b) => (b ? 'on' : 'off');
      return [
        `--widget-media=${onOff(s.widgets.media)}`,
        `--widget-clock=${onOff(s.widgets.clock)}`,
        `--widget-shelf=${onOff(s.widgets.shelf)}`,
        `--widget-todos=${onOff(s.widgets.todos)}`,
        `--hotkey=${s.hotkey}`,
        `--opacity=${s.opacity}`,
        `--position=${s.position}`,
      ];
    },
  },
  {
    id: 'velazoom',
    name: 'VelaZoom',
    description: 'Screen zoom & annotation tool with freeze-frame, spotlight and magnifier.',
    kind: 'external',
    category: 'win',
    kindLabel: 'Windows app',
    icon: 'zoom',
    exeKey: 'velaZoomPath',
    exeName: 'VelaZoom.exe',
    candidates: [
      process.env.ProgramFiles && `${process.env.ProgramFiles}\\VelaZoom\\VelaZoom.exe`,
      'D:\\ai-and-code\\VelaZoom\\publish\\VelaZoom.exe',
    ].filter(Boolean),
    skipIfRunning: true,
    installer: {
      url: 'https://vela.example.com/installers/VelaZoom-Setup.exe',
      fileName: 'VelaZoom-Setup.exe',
    },
  },
];

function byId(id) {
  return SERVICES.find((s) => s.id === id) || null;
}

function computeState(svc, cfg) {
  switch (svc.kind) {
    case 'coming-soon':
      return 'coming-soon';
    case 'native':
      return 'available';
    case 'external':
      return config.resolveTool(cfg, svc.exeKey, svc.candidates) ? 'available' : 'unavailable';
    default:
      return 'unavailable';
  }
}

function listWithStates(cfg) {
  return SERVICES.map((svc) => {
    const { candidates, installer, buildArgs, ...publicPart } = svc;
    return { ...publicPart, state: computeState(svc, cfg) };
  });
}

module.exports = { SERVICES, byId, computeState, listWithStates };
