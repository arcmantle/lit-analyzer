import { getDiagnostics } from '../helpers/analyze.js';
import { tsTest } from '../helpers/ts-test.js';

const SETUP = `
	interface Rec { [key: string]: any }

	type ModelRenderer<M extends object = Rec, C = any> = (props: {
		context: C;
		model:   M;
	}) => string;

	interface FieldRow { a?: string }
	interface FieldHeader { b?: string; actions?: string }
	interface FieldIdentity { name?: string; row?: FieldRow; header?: FieldHeader }

	export interface FormField extends Required<Omit<FieldIdentity, 'row' | 'header'>> {
		matchLabel?: string;
		row?:        Required<FieldRow>;
		header?:     Required<Omit<FieldHeader, 'actions'>> & Pick<FieldHeader, 'actions'>;
		render: {
			viewer: ModelRenderer;
			editor: ModelRenderer;
		};
	}

	class MyElement extends HTMLElement {
		viewers: FormField[] = [];
	}
	customElements.define("my-element", MyElement);

	const viewers: FormField[] = [];
`;

tsTest('repro', t => {
	const { diagnostics } = getDiagnostics(`${ SETUP }\nhtml\`<my-element .viewers=\${viewers}></my-element>\``);
	t.log(JSON.stringify(diagnostics.map(d => d.message), null, 2));
	t.is(diagnostics.length, 0);
});
