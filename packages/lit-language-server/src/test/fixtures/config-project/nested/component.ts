// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// The nested config re-enables 'no-noncallable-event-binding', overriding
// (not merging with) the outer one -- nearest file wins.
html`<button @click="${ 'not a function' }"></button>`;
