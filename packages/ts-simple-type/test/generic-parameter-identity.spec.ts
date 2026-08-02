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

test("A parameter of an inner declaration does not take the argument of an outer parameter with the same name", () => {
	const result = assignable(`
		interface Container<T> {
			value: T;
			make<T>(): T;
		}

		declare function fn(source: { value: string; make: () => number }, target: Container<string>): void;
	`);

	expect(result).toBe(true);
});
