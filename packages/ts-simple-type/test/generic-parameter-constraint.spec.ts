import { expect, test } from "vitest";
import * as ts from "typescript";
import { SimpleTypeGenericArguments, SimpleTypeGenericParameter } from "../src/simple-type.js";
import { toSimpleType } from "../src/transform/to-simple-type.js";
import { programWithVirtualFiles } from "./helpers/analyze-text.js";

function toGenericParameter(code: string): SimpleTypeGenericParameter {
	const program = programWithVirtualFiles(code);
	const sourceFile = program.getSourceFiles().find(file => !file.isDeclarationFile)!;

	const declaration = sourceFile.statements.find(ts.isFunctionDeclaration)!;
	const typeParameter = declaration.typeParameters![0];

	const simpleType = toSimpleType(typeParameter, program.getTypeChecker());
	expect(simpleType.kind).toBe("GENERIC_PARAMETER");

	return simpleType as SimpleTypeGenericParameter;
}

test("A type parameter keeps its constraint", () => {
	const simpleType = toGenericParameter(`function fn<T extends string>(value: T) { return value; }`);

	expect(simpleType.constraint).toEqual({ kind: "STRING" });
});

test("A type parameter without a constraint has no constraint", () => {
	const simpleType = toGenericParameter(`function fn<T>(value: T) { return value; }`);

	expect(simpleType.constraint).toBeUndefined();
});

test("A type parameter keeps both its constraint and its default", () => {
	const simpleType = toGenericParameter(`function fn<T extends string = "a">(value: T) { return value; }`);

	expect(simpleType.constraint).toEqual({ kind: "STRING" });
	expect(simpleType.default).toEqual({ kind: "STRING_LITERAL", value: "a" });
});

test("A generic constraint keeps its type arguments", () => {
	const simpleType = toGenericParameter(`
		interface Base<V> { value: V }
		function fn<T extends Base<string | number>>(value: T) { return value; }
	`);

	const constraint = simpleType.constraint as SimpleTypeGenericArguments;
	expect(constraint.kind).toBe("GENERIC_ARGUMENTS");
	expect(constraint.typeArguments).toHaveLength(1);
	expect(constraint.typeArguments[0]).toEqual({
		kind: "UNION",
		types: [{ kind: "STRING" }, { kind: "NUMBER" }]
	});
});

test("A type parameter constrained by its own declaration does not hang", () => {
	const simpleType = toGenericParameter(`
		interface Comparable<T extends Comparable<T>> { compare(other: T): number }
		function fn<T extends Comparable<T>>(value: T) { return value; }
	`);

	expect(simpleType.constraint?.kind).toBe("GENERIC_ARGUMENTS");
});
