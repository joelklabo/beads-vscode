const fs = require('fs');
const path = require('path');

const helperPath = path.join(__dirname, 'out', 'test', 'setup', 'resolve-extension.js');

module.exports = {
  require: fs.existsSync(helperPath) ? [helperPath] : [],
};
