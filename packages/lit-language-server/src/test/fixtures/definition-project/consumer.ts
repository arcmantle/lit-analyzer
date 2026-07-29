// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

import './component';

html`<my-element .foo="${ 'bar' }"></my-element>`;
html`<my-element @my-event="${ () => {} }"></my-element>`;
