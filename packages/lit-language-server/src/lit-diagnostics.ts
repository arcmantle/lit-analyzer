import type { LitDiagnostic } from '@arcmantle/lit-analyzer';
import type * as ts from 'typescript';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';

/**
 * Translates lit-analyzer's own `LitDiagnostic[]` into LSP `Diagnostic[]`,
 * preserving severity, rule id and
 * message for the same file.
 */
export function translateLitDiagnostics(
	diagnostics: LitDiagnostic[],
	sourceFile: ts.SourceFile,
	doNotShowSuggestions = false,
): Diagnostic[] {
	return diagnostics.map(diagnostic => translateLitDiagnostic(diagnostic, sourceFile, doNotShowSuggestions));
}

function translateLitDiagnostic(diagnostic: LitDiagnostic, sourceFile: ts.SourceFile, dontShowSuggestions: boolean): Diagnostic {
	const start = sourceFile.getLineAndCharacterOfPosition(diagnostic.location.start);
	const end = sourceFile.getLineAndCharacterOfPosition(diagnostic.location.end);

	const message = diagnostic.fixMessage == null ? diagnostic.message : `${ diagnostic.message } ${ diagnostic.fixMessage }`;
	const withSuggestion =
		!dontShowSuggestions && diagnostic.suggestion != null ? `${ message }\n  ${ diagnostic.suggestion }` : message;

	return {
		range:    { start, end },
		severity: diagnostic.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
		code:     diagnostic.source,
		source:   'lit-plugin',
		message:  withSuggestion,
	};
}
