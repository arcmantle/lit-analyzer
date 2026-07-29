import type { LitDiagnostic, Range } from 'lit-analyzer';
import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

import { translateLitDiagnostics } from '../lit-diagnostics.js';

function sourceFileWithLines(...lines: string[]): ts.SourceFile {
	return ts.createSourceFile('test.ts', lines.join('\n'), ts.ScriptTarget.Latest, true);
}

// `LitDiagnostic.location` is a nominally-branded `SourceFileRange`, and the
// brand isn't part of the public API. A cast is the only way to construct one
// from a plain `{ start, end }` outside lit-analyzer's own internals.
function sourceFileRange(range: Range): LitDiagnostic['location'] {
	return range as LitDiagnostic['location'];
}

describe('translateLitDiagnostics', () => {
	test('translates severity, rule id and message', () => {
		const sourceFile = sourceFileWithLines('const x = 1;');
		const diagnostic: LitDiagnostic = {
			location: sourceFileRange({ start: 0, end: 5 }),
			message:  'Unknown tag name',
			source:   'no-unknown-tag-name',
			severity: 'error',
			file:     sourceFile,
		};

		const [ translated ] = translateLitDiagnostics([ diagnostic ], sourceFile);

		expect(translated.severity).toBe(DiagnosticSeverity.Error);
		expect(translated.code).toBe('no-unknown-tag-name');
		expect(translated.message).toBe('Unknown tag name');
	});

	test('maps a warning severity', () => {
		const sourceFile = sourceFileWithLines('const x = 1;');
		const diagnostic: LitDiagnostic = {
			location: sourceFileRange({ start: 0, end: 1 }),
			message:  'Just a warning',
			source:   'no-unknown-tag-name',
			severity: 'warning',
			file:     sourceFile,
		};

		const [ translated ] = translateLitDiagnostics([ diagnostic ], sourceFile);

		expect(translated.severity).toBe(DiagnosticSeverity.Warning);
	});

	test('appends the fix message when present', () => {
		const sourceFile = sourceFileWithLines('const x = 1;');
		const diagnostic: LitDiagnostic = {
			location:   sourceFileRange({ start: 0, end: 1 }),
			message:    'Something is wrong',
			fixMessage: "Did you mean 'y'?",
			source:     'no-unknown-tag-name',
			severity:   'error',
			file:       sourceFile,
		};

		const [ translated ] = translateLitDiagnostics([ diagnostic ], sourceFile);

		expect(translated.message).toBe("Something is wrong Did you mean 'y'?");
	});

	test('appends the suggestion on a new indented line when present', () => {
		const sourceFile = sourceFileWithLines('const x = 1;');
		const diagnostic: LitDiagnostic = {
			location:   sourceFileRange({ start: 0, end: 1 }),
			message:    'Missing import for <my-other-element>',
			suggestion: "You can disable this check by disabling the 'no-missing-import' rule.",
			source:     'no-missing-import',
			severity:   'error',
			file:       sourceFile,
		};

		const [ translated ] = translateLitDiagnostics([ diagnostic ], sourceFile);

		expect(translated.message).toBe(
			"Missing import for <my-other-element>\n  You can disable this check by disabling the 'no-missing-import' rule.",
		);
	});

	test('omits the suggestion when dontShowSuggestions is set', () => {
		const sourceFile = sourceFileWithLines('const x = 1;');
		const diagnostic: LitDiagnostic = {
			location:   sourceFileRange({ start: 0, end: 1 }),
			message:    'Missing import for <my-other-element>',
			suggestion: "You can disable this check by disabling the 'no-missing-import' rule.",
			source:     'no-missing-import',
			severity:   'error',
			file:       sourceFile,
		};

		const [ translated ] = translateLitDiagnostics([ diagnostic ], sourceFile, true);

		expect(translated.message).toBe('Missing import for <my-other-element>');
	});

	test('converts character offsets to line/character positions', () => {
		const sourceFile = sourceFileWithLines('const a = 1;', 'const b = 2;');
		// "b" on the second line sits at offset 19 (line 2, character 6).
		const bOffset = sourceFile.text.indexOf('b');
		const diagnostic: LitDiagnostic = {
			location: sourceFileRange({ start: bOffset, end: bOffset + 1 }),
			message:  'On line two',
			source:   'no-unknown-tag-name',
			severity: 'error',
			file:     sourceFile,
		};

		const [ translated ] = translateLitDiagnostics([ diagnostic ], sourceFile);

		expect(translated.range).toEqual({
			start: { line: 1, character: 6 },
			end:   { line: 1, character: 7 },
		});
	});
});
