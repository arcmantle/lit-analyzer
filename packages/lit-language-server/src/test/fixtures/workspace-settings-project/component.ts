// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// The config file disables both of these rules. Workspace settings, layered
// on top, selectively re-enable one of them without disturbing the other.
html`<unknown-tag></unknown-tag>`;
html`<button @click="${ 'not a function' }"></button>`;
