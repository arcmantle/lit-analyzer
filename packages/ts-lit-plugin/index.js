// tsserver loads TypeScript compiler plugins with `require` and expects a CJS
// style default export, which cannot be expressed in ESM. That consumer is why
// this package stays CommonJS, and why this hand-written file exists to bridge
// the difference.

module.exports = require("./lib/index").init;
