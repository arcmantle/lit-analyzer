// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// No config file directly here: the walk must keep going up past this
// directory to find 'nested/lit-analyzer.config.json', not stop early and
// not skip straight to the outer one.
html`<button @click="${ 'not a function' }"></button>`;
