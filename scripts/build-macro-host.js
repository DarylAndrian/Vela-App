const { mkdirSync, readdirSync, existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'win32') process.exit(0);

const windows = process.env.SystemRoot || 'C:\\Windows';
const compiler = ['Framework64', 'Framework']
  .map((folder) => path.join(windows, 'Microsoft.NET', folder, 'v4.0.30319', 'csc.exe'))
  .find(existsSync);

if (!compiler) {
  throw new Error('Building the Vela macro engine requires Windows .NET Framework 4.x.');
}

const source = path.join(__dirname, '..', 'native', 'macro');
const output = path.join(source, 'dist');
mkdirSync(output, { recursive: true });
const result = spawnSync(compiler, [
  '/nologo', '/target:exe', '/platform:anycpu', '/optimize+',
  '/reference:System.Web.Extensions.dll', '/reference:System.Windows.Forms.dll',
  `/out:${path.join(output, 'VelaMacroHost.exe')}`,
  ...readdirSync(source).filter((name) => name.endsWith('.cs')).map((name) => path.join(source, name)),
], { stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
