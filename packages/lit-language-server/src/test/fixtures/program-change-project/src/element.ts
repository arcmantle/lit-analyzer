import { BaseElement } from './base.js';
import type { Value } from './value-type.js';

export class MyElement extends BaseElement {

	value: Value = '';

}

customElements.define('my-element', MyElement);

declare global {
	interface HTMLElementTagNameMap {
		'my-element': MyElement;
	}
}
