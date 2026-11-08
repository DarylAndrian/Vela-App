const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const png = fs.readFileSync(path.join(root, 'assets', 'icon.png'));

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
header.writeUInt8(0, 6); // width 256
header.writeUInt8(0, 7); // height 256
header.writeUInt8(0, 8); // palette colors
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // planes
header.writeUInt16LE(32, 12); // bit count
header.writeUInt32LE(png.length, 14); // data size
header.writeUInt32LE(22, 18); // data offset

fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), Buffer.concat([header, png]));
console.log(`icon.ico written (${png.length + 22} bytes)`);
