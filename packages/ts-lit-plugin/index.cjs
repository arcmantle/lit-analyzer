// tsserver loads TypeScript compiler plugins with `require` and expects a CJS
// style default export, which cannot be expressed in ESM. The rest of the
// package is ESM, which `require` can load since Node 22.

module.exports = require("./lib/index.js").init;
