import type { LitCompletion, SourceFileRange } from 'lit-analyzer';
import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver/node';

import { translateCompletions } from '../translate-completions.js';

function sourceFileWithLines(fileName: string, ...lines: string[]): ts.SourceFile {
	return ts.createSourceFile(fileName, lines.join('\n'), ts.ScriptTarget.Latest, true);
}

// `LitCompletion.range` is a nominally-branded `SourceFileRange`, and the
// brand isn't part of the public API. A cast is the only way to construct
// one from a plain `{ start, end }` outside lit-analyzer's own internals.
function sourceFileRange(start: number, end: number): SourceFileRange {
	return { start, end } as SourceFileRange;
}

describe('translateCompletions', () => {
	test('translates name, kind and sortText derived from importance', () => {
		const sourceFile = sourceFileWithLines('origin.ts', '<my-el></my-el>');

		const completions: LitCompletion[] = [
			{ name: 'my-element', insert: 'my-element', kind: 'member', importance: 'high' },
			{ name: 'div', insert: 'div', kind: 'enumElement', importance: 'low' },
		];

		const items = translateCompletions(completions, sourceFile, 'origin.ts', 1);

		expect(items).toEqual([
			{
				label:      'my-element',
				kind:       CompletionItemKind.Property,
				sortText:   '0',
				insertText: 'my-element',
				data:       { fileName: 'origin.ts', position: 1, name: 'my-element' },
			},
			{
				label:      'div',
				kind:       CompletionItemKind.EnumMember,
				sortText:   '2',
				insertText: 'div',
				data:       { fileName: 'origin.ts', position: 1, name: 'div' },
			},
		]);
	});

	test('prefers an explicit sortText over one derived from importance', () => {
		const sourceFile = sourceFileWithLines('origin.ts', '<my-el></my-el>');

		const completions: LitCompletion[] = [
			{
				name:       'my-element',
				insert:     'my-element',
				kind:       'member',
				importance: 'low',
				sortText:   'explicit',
			},
		];

		const [ item ] = translateCompletions(completions, sourceFile, 'origin.ts', 1);
		expect(item.sortText).toBe('explicit');
	});

	test("uses CompletionItemKind.Color for a completion with kindModifiers 'color', overriding the target-kind mapping", () => {
		const sourceFile = sourceFileWithLines('origin.ts', 'css`--brand: red;`');

		const completions: LitCompletion[] = [
			{
				name:          '--brand-color',
				insert:        '--brand-color',
				kind:          'variableElement',
				kindModifiers: 'color',
			},
		];

		const [ item ] = translateCompletions(completions, sourceFile, 'origin.ts', 4);

		expect(item.kind).toBe(CompletionItemKind.Color);
	});

	test('translates a range into a replacing textEdit instead of insertText', () => {
		const sourceFile = sourceFileWithLines('origin.ts', '<my-el></my-el>');

		const completions: LitCompletion[] = [
			{
				name:   'my-element',
				insert: 'my-element',
				kind:   'member',
				range:  sourceFileRange(1, 6),
			},
		];

		const [ item ] = translateCompletions(completions, sourceFile, 'origin.ts', 6);

		expect(item.insertText).toBeUndefined();
		expect(item.textEdit).toEqual({
			range:   { start: { line: 0, character: 1 }, end: { line: 0, character: 6 } },
			newText: 'my-element',
		});
	});

	test('carries fileName, position and name on data for a later resolve request', () => {
		const sourceFile = sourceFileWithLines('origin.ts', '<my-el></my-el>');

		const completions: LitCompletion[] = [ { name: 'my-element', insert: 'my-element', kind: 'member' } ];

		const [ item ] = translateCompletions(completions, sourceFile, 'origin.ts', 4);

		expect(item.data).toEqual({ fileName: 'origin.ts', position: 4, name: 'my-element' });
	});
});
