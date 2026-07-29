import './component';

import { classMap, html } from './html-tag.js';

html`<my-element class="${ classMap({ active: true }) }"></my-element>`;
