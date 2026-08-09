import type { LitQuickInfo, SourceFileRange } from '@arcmantle/lit-analyzer';
import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { MarkupKind } from 'vscode-languageserver/node';

import { translateQuickInfo } from '../translate-quick-info.js';

function sourceFileWithLines(fileName: string, ...lines: string[]): ts.SourceFile {
	return ts.createSourceFile(fileName, lines.join('\n'), ts.ScriptTarget.Latest, true);
}

// `LitQuickInfo.range` is a nominally-branded `SourceFileRange`, and the
// brand isn't part of the public API. A cast is the only way to construct
// one from a plain `{ start, end }` outside lit-analyzer's own internals.
function sourceFileRange(start: number, end: number): SourceFileRange {
	return { start, end } as SourceFileRange;
}

describe('translateQuickInfo', () => {
	test('translates the range and wraps primaryInfo in a markdown code block', () => {
		const sourceFile = sourceFileWithLines('origin.ts', '<my-element></my-element>');

		const quickInfo: LitQuickInfo = {
			range:       sourceFileRange(1, 11),
			primaryInfo: '<my-element>',
		};

		const hover = translateQuickInfo(quickInfo, sourceFile);

		expect(hover.range).toEqual({ start: { line: 0, character: 1 }, end: { line: 0, character: 11 } });
		expect(hover.contents).toEqual({ kind: MarkupKind.Markdown, value: '```\n<my-element>\n```' });
	});

	test('appends secondaryInfo as markdown after the primaryInfo code block', () => {
		const sourceFile = sourceFileWithLines('origin.ts', '<my-element></my-element>');

		const quickInfo: LitQuickInfo = {
			range:         sourceFileRange(1, 11),
			primaryInfo:   '<my-element>',
			secondaryInfo: 'A custom element with a **bold** description.',
		};

		const hover = translateQuickInfo(quickInfo, sourceFile);

		expect(hover.contents).toEqual({
			kind:  MarkupKind.Markdown,
			value: '```\n<my-element>\n```\n\nA custom element with a **bold** description.',
		});
	});

	test('does not append anything when secondaryInfo is absent', () => {
		const sourceFile = sourceFileWithLines('origin.ts', 'foo');

		const quickInfo: LitQuickInfo = {
			range:       sourceFileRange(0, 3),
			primaryInfo: '(property) foo: string',
		};

		const hover = translateQuickInfo(quickInfo, sourceFile);

		expect((hover.contents as { value: string; }).value).toBe('```\n(property) foo: string\n```');
	});
});
