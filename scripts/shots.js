const fs = require('fs');
const path = require('path');
const viewManager = require('../src/main/viewManager');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(win) {
  const outDir = path.join(__dirname, 'shots-out');
  fs.mkdirSync(outDir, { recursive: true });

  const capture = async (name) => {
    try {
      const img = await win.capturePage();
      fs.writeFileSync(path.join(outDir, name), img.toPNG());
      console.log(`shot: ${name} (window)`);
      return;
    } catch (err) {
      console.log(`window capture failed (${err.message}) — falling back to webContents capture`);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, name), img.toPNG());
      console.log(`shot: ${name} (renderer)`);
      const view = viewManager.getView();
      if (view) {
        const vimg = await view.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, name.replace('.png', '-view.png')), vimg.toPNG());
        console.log(`shot: ${name.replace('.png', '-view.png')} (service view)`);
      }
    }
  };

  const js = (code) => win.webContents.executeJavaScript(code);

  await sleep(600);
  await capture('01-home-dark.png');

  await js(`document.getElementById('settingsBtn').click()`);
  await sleep(400);
  await capture('02-settings-dark.png');

  await js(`document.getElementById('settingsCancel').click();
            document.getElementById('themeBtn').click()`);
  await sleep(400);
  await capture('03-home-light.png');

  await js(`document.querySelector('[data-id="velapt"]').click()`);
  await sleep(1500);
  await capture('04-service-velapt.png');

  const view = viewManager.getView();
  if (view) {
    try {
      const bounds = view.getBounds();
      const title = view.webContents.getTitle();
      console.log(`view bounds: ${JSON.stringify(bounds)} title: ${JSON.stringify(title)}`);
      const vimg = await view.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, '04-service-velapt-view.png'), vimg.toPNG());
      console.log('shot: 04-service-velapt-view.png (service view)');
    } catch (err) {
      console.log(`view capture unavailable (${err.message})`);
    }
  } else {
    console.log('ERROR: no service view open after velapt click');
  }

  await js(`document.getElementById('homeBtn').click()`);
  await sleep(300);

  await js(`document.querySelector('[data-id="picture-connector"]').click()`);
  await sleep(3000);
  await capture('05-native-picture-connector.png');
  const pcView = viewManager.getView();
  if (pcView) {
    try {
      const vimg = await pcView.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, '05-native-picture-connector-view.png'), vimg.toPNG());
      console.log('shot: 05-native-picture-connector-view.png (native view)');
    } catch (err) {
      console.log(`view capture unavailable (${err.message})`);
    }
  }

  await js(`document.getElementById('homeBtn').click()`);
  await sleep(300);
  await js(`document.querySelector('[data-id="chart-code"]').click()`);
  await sleep(3000);
  await capture('06-native-connect.png');
  const ccView = viewManager.getView();
  if (ccView) {
    try {
      const vimg = await ccView.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, '06-native-connect-view.png'), vimg.toPNG());
      console.log('shot: 06-native-connect-view.png (native view)');
    } catch (err) {
      console.log(`view capture unavailable (${err.message})`);
    }
  }
}

module.exports = { run };
