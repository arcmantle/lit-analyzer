// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

import './component';

// Whether this errors depends on what component.ts currently declares.
html`<my-element .foo="${ 'bar' }"></my-element>`;
html`<div title="Native element" aria-label="Native element"></div>`;
html`<input disabled class="Native element">`;
