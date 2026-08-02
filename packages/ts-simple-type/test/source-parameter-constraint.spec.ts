import { expect, test } from "vitest";
import * as ts from "typescript";
import { isAssignableToSimpleType } from "../src/is-assignable/is-assignable-to-simple-type.js";
import { SimpleType } from "../src/simple-type.js";
import { toSimpleType } from "../src/transform/to-simple-type.js";
import { programWithVirtualFiles } from "./helpers/analyze-text.js";

/**
 * Builds the two compared types from the parameters of `fn`. The first parameter is the source
 * type, the second is the target type.
 */
function assignable(code: string): boolean {
	const program = programWithVirtualFiles(code);
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;

	const declaration = sourceFile.statements.find(ts.isFunctionDeclaration)!;
	const [source, target] = declaration.parameters.map(parameter => toSimpleType(parameter.type!, checker) as SimpleType);

	return isAssignableToSimpleType(target, source);
}

test("A source parameter binds through its constraint", () => {
	const result = assignable(`
		interface Base<V> { value: V }
		declare function fn<U extends Base<string>>(source: U, target: Base<string | number>): void;
	`);

	expect(result).toBe(true);
});

test("A source parameter whose constraint does not fit the target still reports", () => {
	const result = assignable(`declare function fn<U extends string>(source: U, target: number): void;`);

	expect(result).toBe(false);
});

test("A source parameter without a constraint binds to anything", () => {
	const result = assignable(`declare function fn<T>(source: T, target: number): void;`);

	expect(result).toBe(true);
});

test("A source parameter with a constraint that names another parameter binds", () => {
	const result = assignable(`
		declare function fn<V extends string, U extends V>(source: U, target: string): void;
	`);

	expect(result).toBe(true);
});
