import './element.js';

declare function html(strings: TemplateStringsArray, ...values: unknown[]): unknown;

export function render(value: string): unknown {
	return html`<my-element .value=${ value }></my-element>`;
}
