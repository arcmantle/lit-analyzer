import { getDiagnostics } from '../helpers/analyze.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('probe: boolean binding with boolean | undefined', () => {
	const { diagnostics } = getDiagnostics('let b: boolean | undefined; html`<input ?disabled="${b}" />`', {
		rules: { 'no-incompatible-type-binding': true },
	});
	console.log('PROBE_BOOL_UNDEFINED', JSON.stringify(diagnostics.map(d => d.message)));
});

tsTest('probe: boolean binding with boolean', () => {
	const { diagnostics } = getDiagnostics('let b: boolean; html`<input ?disabled="${b}" />`', {
		rules: { 'no-incompatible-type-binding': true },
	});
	console.log('PROBE_BOOL', JSON.stringify(diagnostics.map(d => d.message)));
});

tsTest('probe: boolean binding with true literal union', () => {
	const { diagnostics } = getDiagnostics('let b: true | null; html`<input ?disabled="${b}" />`', {
		rules: { 'no-incompatible-type-binding': true },
	});
	console.log('PROBE_TRUE_NULL', JSON.stringify(diagnostics.map(d => d.message)));
});
