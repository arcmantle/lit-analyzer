import { BaseElement } from './base.js';
import type { Value } from './value-type.js';

declare const property: (options: { type: ArrayConstructor; }) => PropertyDecorator;

export class MyElement extends BaseElement {

	value: Value = '';

	@property({ type: Array })
	viewers: string[] = [];

}

customElements.define('my-element', MyElement);

declare global {
	interface HTMLElementTagNameMap {
		'my-element': MyElement;
	}
}
