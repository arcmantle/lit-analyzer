// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// The old tsconfig plugin entry says to turn this rule off, but the language
// server must not honor it -- only report that the entry exists.
html`<button @click="${ 'not a function' }"></button>`;
