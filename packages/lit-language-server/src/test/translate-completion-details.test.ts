import type { LitCompletionDetails } from 'lit-analyzer';
import { describe, expect, test } from 'vitest';
import { CompletionItem, MarkupKind } from 'vscode-languageserver/node';

import { translateCompletionDetails } from '../translate-completion-details.js';

describe('translateCompletionDetails', () => {
	test("wraps primaryInfo in a markdown code block and keeps the item's other fields", () => {
		const item: CompletionItem = { label: 'foo', kind: 10, data: { fileName: 'origin.ts', position: 4, name: 'foo' } };
		const details: LitCompletionDetails = { name: 'foo', kind: 'member', primaryInfo: '(property) foo: string' };

		const resolved = translateCompletionDetails(item, details);

		expect(resolved).toEqual({
			label:         'foo',
			kind:          10,
			data:          { fileName: 'origin.ts', position: 4, name: 'foo' },
			documentation: { kind: MarkupKind.Markdown, value: '```\n(property) foo: string\n```' },
		});
	});

	test('appends secondaryInfo as markdown after the primaryInfo code block', () => {
		const item: CompletionItem = { label: 'foo', kind: 10 };
		const details: LitCompletionDetails = {
			name:          'foo',
			kind:          'member',
			primaryInfo:   '(property) foo: string',
			secondaryInfo: 'A **bold** description.',
		};

		const resolved = translateCompletionDetails(item, details);

		expect(resolved.documentation).toEqual({
			kind:  MarkupKind.Markdown,
			value: '```\n(property) foo: string\n```\n\nA **bold** description.',
		});
	});
});
