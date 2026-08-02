import * as ts from 'typescript';
import { expect, test } from 'vitest';

import { isAssignableToType } from '../src/is-assignable/is-assignable-to-type.js';
import { SimpleType } from '../src/simple-type.js';
import { toSimpleType } from '../src/transform/to-simple-type.js';
import { programWithVirtualFiles } from './helpers/analyze-text.js';

/**
 * Two conversions of one type, each with its own cache, so the comparison
 * cannot take the shortcut it takes when both sides are one object.
 */
function twoConversionsOf(code: string): [SimpleType, SimpleType] {
	const program = programWithVirtualFiles(code, { includeLib: true });
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;
	const statement = sourceFile.statements.find(ts.isVariableStatement)!;
	const type = checker.getTypeAtLocation(statement.declarationList.declarations[0]!);

	return [
		toSimpleType(type, checker, { cache: new WeakMap() }),
		toSimpleType(type, checker, { cache: new WeakMap() }),
	];
}

test('An intersection inside a union is assignable to itself', () => {
	const [ a, b ] = twoConversionsOf(`
		interface A { a: string }
		interface B { b: string }
		declare const value: (A & B) | undefined;
	`);

	expect(isAssignableToType(a, b)).toBe(true);
});

// The reported shape: an optional member whose type intersects two mapped types.
test('An intersection of mapped types inside a union is assignable to itself', () => {
	const [ a, b ] = twoConversionsOf(`
		interface FieldHeader { label?: string; actions?: string[] }
		type Header = Required<Omit<FieldHeader, 'actions'>> & Pick<FieldHeader, 'actions'>;
		declare const value: Header | undefined;
	`);

	expect(isAssignableToType(a, b)).toBe(true);
});
