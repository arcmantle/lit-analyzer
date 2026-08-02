import * as ts from 'typescript';
import { expect, test } from 'vitest';

import { SimpleType, SimpleTypeGenericArguments, SimpleTypeInterface } from '../src/simple-type.js';
import { toSimpleType } from '../src/transform/to-simple-type.js';
import { getGenericParameterKey } from '../src/utils/get-generic-parameter-key.js';
import { extendTypeParameterMap } from '../src/utils/simple-type-util.js';
import { programWithVirtualFiles } from './helpers/analyze-text.js';

/**
 * TypeScript fills an omitted argument itself, so a reference written in source text always arrives with a
 * complete argument list. A short argument list reaches `extendTypeParameterMap` from a synthesized node, so
 * the target below comes from real source text and only the wrapper is built here.
 */
function referenceWithoutArguments(code: string): SimpleTypeGenericArguments {
	const program = programWithVirtualFiles(code);
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;

	const declaration = sourceFile.statements.find(ts.isVariableStatement)!;
	const typeNode = declaration.declarationList.declarations[0].type!;

	const reference = toSimpleType(typeNode, program.getTypeChecker(), { eager: true }) as SimpleTypeGenericArguments;
	expect(reference.kind).toBe('GENERIC_ARGUMENTS');

	return { ...reference, typeArguments: [] };
}

/** The map is keyed by declaration identity, so the key comes from the parameter node. */
function keyOfFirstParameter(reference: SimpleTypeGenericArguments): string {
	const target = reference.target as SimpleTypeInterface;

	return getGenericParameterKey(target.typeParameters![0]);
}

test('An omitted argument instantiates the parameter with its default', () => {
	const reference = referenceWithoutArguments(`
		interface Box<C = string> { value: C }
		declare const box: Box;
	`);

	const parameterMap = extendTypeParameterMap(reference, new Map<string, SimpleType>());

	expect(parameterMap.get(keyOfFirstParameter(reference))).toEqual({ kind: 'STRING' });
});

test('An omitted argument without a default stays unresolved', () => {
	const reference = referenceWithoutArguments(`
		interface Box<C> { value: C }
		declare const box: Box<string>;
	`);

	const parameterMap = extendTypeParameterMap(reference, new Map<string, SimpleType>());

	expect(parameterMap.has(keyOfFirstParameter(reference))).toBe(false);
});

test('A given argument wins over the default', () => {
	const reference = referenceWithoutArguments(`
		interface Box<C = string> { value: C }
		declare const box: Box<number>;
	`);
	const withArgument: SimpleTypeGenericArguments = { ...reference, typeArguments: [ { kind: 'NUMBER' } ] };

	const parameterMap = extendTypeParameterMap(withArgument, new Map<string, SimpleType>());

	expect(parameterMap.get(keyOfFirstParameter(withArgument))).toEqual({ kind: 'NUMBER' });
});
