import { getDiagnostics } from '../helpers/analyze.js';
import { tsTest } from '../helpers/ts-test.js';

const probe = (label: string, code: string, rules: Record<string, boolean>) => {
	const { diagnostics } = getDiagnostics(code, { rules: rules as never });
	console.log(label, JSON.stringify(diagnostics.map(d => `${ d.source }: ${ d.message }`)));
};

tsTest('probe event listener optional', () => {
	probe(
		'EVENT_OPTIONAL',
		'let h: ((e: Event) => void) | undefined; html`<input @input="${h}" />`',
		{ 'no-noncallable-event-binding': true },
	);
});

tsTest('probe boolean in attribute binding union', () => {
	probe(
		'ATTR_STRING_OR_BOOL',
		'let b: string | boolean; html`<input maxlength="${b}" />`',
		{ 'no-boolean-in-attribute-binding': true },
	);
});

tsTest('probe js file nullability', () => {
	probe(
		'PROP_NULLABLE',
		'let s: string | undefined; html`<input .value="${s}" />`',
		{ 'no-incompatible-type-binding': true },
	);
});

tsTest('probe lit2 directive instance', () => {
	probe(
		'ELEMENT_BINDING_ANY',
		'let d: any; html`<input ${d} />`',
		{ 'no-invalid-directive-binding': true },
	);
});
