import * as ts from 'typescript';
import { expect, test } from 'vitest';

import { SimpleType, SimpleTypeGenericArguments } from '../src/simple-type.js';
import { simpleTypeToString } from '../src/transform/simple-type-to-string.js';
import { toSimpleType } from '../src/transform/to-simple-type.js';
import { programWithVirtualFiles } from './helpers/analyze-text.js';

function toTypeOfValue(code: string): SimpleType {
	const program = programWithVirtualFiles(code);
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;
	const statement = sourceFile.statements.find(ts.isVariableStatement)!;

	return toSimpleType(statement.declarationList.declarations[0]!, program.getTypeChecker());
}

test('A non-generic alias gives the type it names, not an alias node', () => {
	expect(toTypeOfValue(`type A = string; declare const value: A;`).kind).toBe('STRING');
	expect(toTypeOfValue(`type A = { a: string }; declare const value: A;`).kind).toBe('OBJECT');
});

test('A non-generic union alias keeps its members in the type string', () => {
	const simpleType = toTypeOfValue(`type A = 'a' | 'b'; declare const value: A;`);

	expect(simpleType.kind).toBe('UNION');
	expect(simpleTypeToString(simpleType)).toBe('"a" | "b"');
});

test('A generic alias keeps its alias node under a generic arguments node', () => {
	const simpleType = toTypeOfValue(`type A<T> = { value: T }; declare const value: A<string>;`);

	expect(simpleType.kind).toBe('GENERIC_ARGUMENTS');

	const target = (simpleType as SimpleTypeGenericArguments).target;

	expect(target.kind).toBe('ALIAS');
});
