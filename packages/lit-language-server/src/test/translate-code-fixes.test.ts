import type { LitCodeFix, SourceFileRange } from 'lit-analyzer';
import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { translateCodeFixes } from '../translate-code-fixes.js';

function sourceFileWithLines(fileName: string, ...lines: string[]): ts.SourceFile {
	return ts.createSourceFile(fileName, lines.join('\n'), ts.ScriptTarget.Latest, true);
}

// `LitCodeFixAction.range` is a nominally-branded `SourceFileRange`, and the
// brand isn't part of the public API. A cast is the only way to construct
// one from a plain `{ start, end }` outside lit-analyzer's own internals.
function sourceFileRange(start: number, end: number): SourceFileRange {
	return { start, end } as SourceFileRange;
}

describe('translateCodeFixes', () => {
	test('translates a single-action fix into one CodeAction with one TextEdit', () => {
		const sourceFile = sourceFileWithLines('consumer.ts', 'html`<my-elment></my-elment>`;');

		const codeFixes: LitCodeFix[] = [
			{
				name:    '',
				message: 'Import <my-element> from module "./component"',
				actions: [
					{
						range:   sourceFileRange(0, 0),
						newText: '\nimport "./component";',
					},
				],
			},
		];

		const [ action ] = translateCodeFixes(codeFixes, sourceFile);

		expect(action.title).toBe('Import <my-element> from module "./component"');
		expect(action.kind).toBe('quickfix');
		const uri = Object.keys(action.edit!.changes!)[0];
		expect(uri.endsWith('consumer.ts')).toBe(true);
		expect(action.edit!.changes![uri]).toEqual([
			{
				range:   { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				newText: '\nimport "./component";',
			},
		]);
	});

	test('translates a multi-action fix into one CodeAction with a TextEdit per action', () => {
		const sourceFile = sourceFileWithLines('consumer.ts', '<my-elment></my-elment>');
		const closeStart = '<my-elment></'.length;

		const codeFixes: LitCodeFix[] = [
			{
				name:    '',
				message: "Change tag name to 'my-element'",
				actions: [
					{ range: sourceFileRange(1, 10), newText: 'my-element' },
					{ range: sourceFileRange(closeStart, closeStart + 9), newText: 'my-element' },
				],
			},
		];

		const [ action ] = translateCodeFixes(codeFixes, sourceFile);

		const uri = Object.keys(action.edit!.changes!)[0];
		const edits = action.edit!.changes![uri];
		expect(edits).toHaveLength(2);
		expect(edits[0].newText).toBe('my-element');
		expect(edits[1].newText).toBe('my-element');
		expect(edits[0].range).toEqual({ start: { line: 0, character: 1 }, end: { line: 0, character: 10 } });
		expect(edits[1].range).toEqual({ start: { line: 0, character: closeStart }, end: { line: 0, character: closeStart + 9 } });
	});

	test('translates every fix when there is more than one', () => {
		const sourceFile = sourceFileWithLines('consumer.ts', 'x');

		const codeFixes: LitCodeFix[] = [
			{ name: '', message: 'First fix', actions: [ { range: sourceFileRange(0, 1), newText: 'a' } ] },
			{ name: '', message: 'Second fix', actions: [ { range: sourceFileRange(0, 1), newText: 'b' } ] },
		];

		const actions = translateCodeFixes(codeFixes, sourceFile);

		expect(actions).toHaveLength(2);
		expect(actions.map(action => action.title)).toEqual([ 'First fix', 'Second fix' ]);
	});
});
