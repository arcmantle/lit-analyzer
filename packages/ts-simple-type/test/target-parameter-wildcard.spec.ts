import * as ts from 'typescript';
import { expect, test } from 'vitest';

import { isAssignableToSimpleType } from '../src/is-assignable/is-assignable-to-simple-type.js';
import { SimpleType } from '../src/simple-type.js';
import { toSimpleType } from '../src/transform/to-simple-type.js';
import { programWithVirtualFiles } from './helpers/analyze-text.js';

/**
 * Builds the two compared types from the parameters of `fn`. The first parameter is the source
 * type, the second is the target type.
 */
function assignable(code: string): boolean {
	const program = programWithVirtualFiles(code);
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;

	const declaration = sourceFile.statements.find(ts.isFunctionDeclaration)!;
	const [ source, target ] = declaration.parameters.map(parameter => toSimpleType(parameter.type!, checker) as SimpleType);

	return isAssignableToSimpleType(target, source);
}

test('A target parameter with a constraint accepts a value the constraint would reject', () => {
	const result = assignable(`declare function fn<T extends string>(source: number, target: T): void;`);

	expect(result).toBe(true);
});

test('A target parameter accepts a bound value of its constraint', () => {
	const result = assignable(`
		interface Base<V> { value: V }
		declare function fn<T extends Base<string | number>>(source: Base<string>, target: T): void;
	`);

	expect(result).toBe(true);
});

test('A target parameter without a constraint accepts anything', () => {
	const result = assignable(`declare function fn<T>(source: string, target: T): void;`);

	expect(result).toBe(true);
});

test('A target parameter does not fall back to its default', () => {
	const result = assignable(`declare function fn<T = string>(source: number, target: T): void;`);

	expect(result).toBe(true);
});
