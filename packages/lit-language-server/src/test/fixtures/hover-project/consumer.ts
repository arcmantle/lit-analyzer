// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

import './component';

html`<my-element id="thing" .foo="${ 'bar' }" @my-event="${ () => {} }"></my-element>`;
