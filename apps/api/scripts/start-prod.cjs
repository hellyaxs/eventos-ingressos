const { existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const candidates = [join(root, 'dist/main.js'), join(root, 'dist/src/main.js')];
const entry = candidates.find((file) => existsSync(file));

if (!entry) {
  console.error('Nest build output not found. Expected dist/main.js');
  process.exit(1);
}

require(entry);
