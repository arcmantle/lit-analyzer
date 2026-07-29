import type { LitDefinition, SourceFileRange } from 'lit-analyzer';
import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { translateDefinition } from '../translate-definition.js';

function sourceFileWithLines(fileName: string, ...lines: string[]): ts.SourceFile {
	return ts.createSourceFile(fileName, lines.join('\n'), ts.ScriptTarget.Latest, true);
}

// `LitDefinition.fromRange` and `LitDefinitionTargetRange.range` are a
// nominally-branded `SourceFileRange`, and the brand isn't part of the public
// API. A cast is the only way to construct one from a plain `{ start, end }`
// outside lit-analyzer's own internals.
function sourceFileRange(start: number, end: number): SourceFileRange {
	return { start, end } as SourceFileRange;
}

describe('translateDefinition', () => {
	test('translates the origin range and a range-kind target into LocationLinks', () => {
		const originSourceFile = sourceFileWithLines('origin.ts', '<my-element></my-element>"');
		const targetSourceFile = sourceFileWithLines('target.ts', 'export class MyElement extends HTMLElement {}');

		const definition: LitDefinition = {
			fromRange: sourceFileRange(1, 11),
			targets:   [
				{
					kind:       'range',
					sourceFile: targetSourceFile,
					range:      sourceFileRange(13, 22),
					name:       'MyElement',
				},
			],
		};

		const [ link ] = translateDefinition(definition, originSourceFile);

		expect(link.originSelectionRange).toEqual({ start: { line: 0, character: 1 }, end: { line: 0, character: 11 } });
		expect(link.targetUri.endsWith('target.ts')).toBe(true);
		expect(link.targetRange).toEqual({ start: { line: 0, character: 13 }, end: { line: 0, character: 22 } });
		expect(link.targetSelectionRange).toEqual(link.targetRange);
	});

	test("translates a node-kind target using the node's own start and end", () => {
		const originSourceFile = sourceFileWithLines('origin.ts', '<my-element></my-element>"');
		const targetSourceFile = sourceFileWithLines('target.ts', 'export class MyElement extends HTMLElement {}');
		const classNode = targetSourceFile.statements[0];

		const definition: LitDefinition = {
			fromRange: sourceFileRange(1, 11),
			targets:   [ { kind: 'node', node: classNode, name: 'MyElement' } ],
		};

		const [ link ] = translateDefinition(definition, originSourceFile);

		expect(link.targetUri.endsWith('target.ts')).toBe(true);
		expect(link.targetRange).toEqual({
			start: targetSourceFile.getLineAndCharacterOfPosition(classNode.getStart()),
			end:   targetSourceFile.getLineAndCharacterOfPosition(classNode.getEnd()),
		});
	});

	test('translates every target when there is more than one', () => {
		const originSourceFile = sourceFileWithLines('origin.ts', 'x');
		const targetSourceFile = sourceFileWithLines('target.ts', 'a', 'b');

		const definition: LitDefinition = {
			fromRange: sourceFileRange(0, 1),
			targets:   [
				{ kind: 'range', sourceFile: targetSourceFile, range: sourceFileRange(0, 1) },
				{ kind: 'range', sourceFile: targetSourceFile, range: sourceFileRange(2, 3) },
			],
		};

		const links = translateDefinition(definition, originSourceFile);

		expect(links).toHaveLength(2);
	});
});
