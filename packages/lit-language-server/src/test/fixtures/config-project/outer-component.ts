// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// The outer config disables 'no-noncallable-event-binding', so this file --
// which has no nearer config of its own -- should produce no diagnostic.
html`<button @click="${ 'not a function' }"></button>`;
