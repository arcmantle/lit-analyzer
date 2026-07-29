// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// A string bound to an event listener is never callable, so this always
// triggers 'no-noncallable-event-binding' -- deliberately chosen because that
// rule defaults to "error" whether or not the project is in strict mode, so
// it doesn't depend on config wiring this server doesn't do yet.
html`<button @click="${ 'not a function' }"></button>`;
