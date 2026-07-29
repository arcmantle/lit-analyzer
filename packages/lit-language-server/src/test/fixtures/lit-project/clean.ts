// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// Plain native elements, no bindings -- nothing here should ever be flagged.
html`<div>Hello</div>`;
