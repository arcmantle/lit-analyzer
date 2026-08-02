import { getDiagnostics } from '../helpers/analyze.js';
import { hasDiagnostic, hasNoDiagnostics } from '../helpers/assert.js';
import { tsTest } from '../helpers/ts-test.js';

// The CSS service needs more than one line, because single line templates are skipped.
const INVALID_CSS = 'css`\n\tdiv { colorz: red; }\n`';

tsTest('Report invalid css', t => {
	const { diagnostics } = getDiagnostics(INVALID_CSS, { rules: { 'no-invalid-css': 'error' } });
	hasDiagnostic(t, diagnostics, 'no-invalid-css');
});

tsTest("Don't report invalid css when 'no-invalid-css' is turned off", t => {
	const { diagnostics } = getDiagnostics(INVALID_CSS, { rules: { 'no-invalid-css': 'off' } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report invalid css when 'no-invalid-css' is turned off in strict mode", t => {
	const { diagnostics } = getDiagnostics(INVALID_CSS, { strict: true, rules: { 'no-invalid-css': 'off' } });
	hasNoDiagnostics(t, diagnostics);
});

tsTest("Don't report invalid css when the deprecated 'skipCssChecks' option is set", t => {
	const { diagnostics } = getDiagnostics(INVALID_CSS, { skipCssChecks: true } as never);
	hasNoDiagnostics(t, diagnostics);
});
