import { LitAnalyzerRuleId } from '../../lib/analyze/lit-analyzer-config.js';
import { LitDiagnostic } from '../../lib/analyze/types/lit-diagnostic.js';
import { TestContext } from './ts-test.js';

export function hasDiagnostic(t: TestContext, diagnostics: LitDiagnostic[], ruleName: LitAnalyzerRuleId): void {
	if (diagnostics.length !== 1)
		prettyLogDiagnostics(t, diagnostics);

	t.is(diagnostics.length, 1);
	t.is(diagnostics[0].source, ruleName);
}

export function hasNoDiagnostics(t: TestContext, diagnostics: LitDiagnostic[]): void {
	if (diagnostics.length !== 0)
		prettyLogDiagnostics(t, diagnostics);

	t.is(diagnostics.length, 0);
}

function prettyLogDiagnostics(t: TestContext, diagnostics: LitDiagnostic[]) {
	t.log(diagnostics.map(diagnostic => `${ diagnostic.source }: ${ diagnostic.message }`));
}
