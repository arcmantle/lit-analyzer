import { BaseElement } from './base.js';

export class MyElement extends BaseElement {

	value: string = '';

}

customElements.define('my-element', MyElement);

declare global {
	interface HTMLElementTagNameMap {
		'my-element': MyElement;
	}
}
