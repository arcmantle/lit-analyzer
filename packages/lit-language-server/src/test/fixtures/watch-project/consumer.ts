// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// Whether this errors depends on whether new-component.ts currently exists
// and defines this tag -- no import needed, lit-analyzer discovers custom
// elements from the whole project, not from the import graph.
html`<new-component></new-component>`;
