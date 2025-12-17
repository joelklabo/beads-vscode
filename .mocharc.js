const fs = require('fs');
const path = require('path');

const helperPath = path.join(__dirname, 'out', 'test', 'setup', 'resolve-extension.js');
const useDist = process.env.BEADY_MOCHA_USE_DIST === '1';

module.exports = useDist && fs.existsSync(helperPath) ? { require: [helperPath] } : {};
