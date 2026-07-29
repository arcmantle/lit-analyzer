import * as ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { translateSignatureHelp } from '../translate-signature-help.js';

function displayPart(text: string, kind = 'text'): ts.SymbolDisplayPart {
	return { text, kind };
}

function signatureHelpParameter(name: string): ts.SignatureHelpParameter {
	return {
		name,
		documentation: [ displayPart(`${ name } doc`) ],
		displayParts:  [ displayPart(name) ],
		isOptional:    false,
	};
}

describe('translateSignatureHelp', () => {
	test('returns null when there are no items', () => {
		expect(translateSignatureHelp(undefined)).toBeNull();
	});

	test('filters out the single html/css tag signature', () => {
		const items: ts.SignatureHelpItems = {
			items: [
				{
					isVariadic:            false,
					prefixDisplayParts:    [ displayPart('html', 'aliasName') ],
					suffixDisplayParts:    [],
					separatorDisplayParts: [ displayPart(', ') ],
					parameters:            [],
					documentation:         [],
					tags:                  [],
				},
			],
			applicableSpan:    { start: 0, length: 0 },
			selectedItemIndex: 0,
			argumentIndex:     0,
			argumentCount:     1,
		};

		expect(translateSignatureHelp(items)).toBeNull();
	});

	test("translates an ordinary call's signature, e.g. a directive inside a template", () => {
		const items: ts.SignatureHelpItems = {
			items: [
				{
					isVariadic:            false,
					prefixDisplayParts:    [ displayPart('classMap', 'functionName'), displayPart('(', 'punctuation') ],
					suffixDisplayParts:    [ displayPart(')', 'punctuation') ],
					separatorDisplayParts: [ displayPart(', ') ],
					parameters:            [ signatureHelpParameter('classInfo') ],
					documentation:         [ displayPart('Applies css classes.') ],
					tags:                  [],
				},
			],
			applicableSpan:    { start: 0, length: 0 },
			selectedItemIndex: 0,
			argumentIndex:     0,
			argumentCount:     1,
		};

		const result = translateSignatureHelp(items);

		expect(result).not.toBeNull();
		expect(result!.signatures).toHaveLength(1);
		expect(result!.signatures[0].label).toBe('classMap(classInfo)');
		expect(result!.signatures[0].documentation).toBe('Applies css classes.');
		expect(result!.signatures[0].parameters).toEqual([ { label: [ 9, 18 ], documentation: 'classInfo doc' } ]);
		expect(result!.activeSignature).toBe(0);
		expect(result!.activeParameter).toBe(0);
	});

	test("computes each parameter's label offset for a signature with more than one parameter", () => {
		const items: ts.SignatureHelpItems = {
			items: [
				{
					isVariadic:            false,
					prefixDisplayParts:    [ displayPart('styleMap', 'functionName'), displayPart('(', 'punctuation') ],
					suffixDisplayParts:    [ displayPart(')', 'punctuation') ],
					separatorDisplayParts: [ displayPart(', ') ],
					parameters:            [ signatureHelpParameter('first'), signatureHelpParameter('second') ],
					documentation:         [],
					tags:                  [],
				},
			],
			applicableSpan:    { start: 0, length: 0 },
			selectedItemIndex: 0,
			argumentIndex:     1,
			argumentCount:     2,
		};

		const result = translateSignatureHelp(items);

		expect(result).not.toBeNull();
		const [ signature ] = result!.signatures;
		expect(signature.label).toBe('styleMap(first, second)');
		expect(signature.parameters).toEqual([
			{ label: [ 9, 14 ], documentation: 'first doc' },
			{ label: [ 16, 22 ], documentation: 'second doc' },
		]);
		expect(result!.activeParameter).toBe(1);
	});

	test('does not filter a tag-like signature that also has other items', () => {
		const items: ts.SignatureHelpItems = {
			items: [
				{
					isVariadic:            false,
					prefixDisplayParts:    [ displayPart('html', 'aliasName') ],
					suffixDisplayParts:    [],
					separatorDisplayParts: [],
					parameters:            [],
					documentation:         [],
					tags:                  [],
				},
				{
					isVariadic:            false,
					prefixDisplayParts:    [ displayPart('otherOverload', 'functionName') ],
					suffixDisplayParts:    [],
					separatorDisplayParts: [],
					parameters:            [],
					documentation:         [],
					tags:                  [],
				},
			],
			applicableSpan:    { start: 0, length: 0 },
			selectedItemIndex: 0,
			argumentIndex:     0,
			argumentCount:     0,
		};

		expect(translateSignatureHelp(items)).not.toBeNull();
	});
});
