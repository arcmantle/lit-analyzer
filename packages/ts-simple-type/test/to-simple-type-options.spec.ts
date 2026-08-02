import * as ts from 'typescript';
import { expect, test } from 'vitest';

import { toSimpleType } from '../src/transform/to-simple-type.js';
import { programWithVirtualFiles } from './helpers/analyze-text.js';

function declarationOf(code: string): { declaration: ts.Node; checker: ts.TypeChecker; } {
	const program = programWithVirtualFiles(code, { includeLib: true });
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;
	const statement = sourceFile.statements.find(ts.isVariableStatement)!;

	return { declaration: statement.declarationList.declarations[0]!, checker: program.getTypeChecker() };
}

test('A conversion from a node uses the cache the caller gives it', () => {
	const { declaration, checker } = declarationOf(`interface A { a: string } declare const value: A;`);
	const cache = new WeakMap<ts.Type, never>();

	const first = toSimpleType(declaration, checker, { cache });
	const second = toSimpleType(declaration, checker, { cache: new WeakMap() });

	expect(cache.has(checker.getTypeAtLocation(declaration))).toBe(true);
	expect(first).not.toBe(second);
});

test('A conversion from a node uses the eager option the caller gives it', () => {
	const { declaration, checker } = declarationOf(`interface A { a: string } declare const value: A;`);

	const eager = toSimpleType(declaration, checker, { eager: true, cache: new WeakMap() });

	expect(Object.isFrozen(eager)).toBe(true);
});
