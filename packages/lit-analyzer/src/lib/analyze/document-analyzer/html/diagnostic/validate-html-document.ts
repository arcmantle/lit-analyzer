import { LitAnalyzerContext } from '../../../lit-analyzer-context.js';
import { HtmlDocument } from '../../../parse/document/text-document/html-document/html-document.js';
import { RuleTiming } from '../../../rule-collection.js';
import { LitDiagnostic } from '../../../types/lit-diagnostic.js';
import { convertRuleDiagnosticToLitDiagnostic } from '../../../util/rule-diagnostic-util.js';

export function validateHTMLDocument(
	htmlDocument: HtmlDocument,
	context: LitAnalyzerContext,
	timings?: RuleTiming,
): LitDiagnostic[] {
	return context.rules
		.getDiagnosticsFromDocument(htmlDocument, context, timings)
		.map(d => convertRuleDiagnosticToLitDiagnostic(d, context));
}
