import { expect, test } from "vitest";
import { SimpleType, SimpleTypeGenericParameter } from "../src/simple-type.js";
import { resolveGenericParameter } from "../src/utils/resolve-generic-parameter.js";

const bare: SimpleTypeGenericParameter = { kind: "GENERIC_PARAMETER", name: "T" };
const constrained: SimpleTypeGenericParameter = { kind: "GENERIC_PARAMETER", name: "T", constraint: { kind: "STRING" } };

test("An argument in the map wins over the constraint", () => {
	const map = new Map<string, SimpleType>([["T", { kind: "NUMBER" }]]);

	expect(resolveGenericParameter(constrained, map, "source")).toEqual({ kind: "NUMBER" });
	expect(resolveGenericParameter(constrained, map, "target")).toEqual({ kind: "NUMBER" });
});

test("A source parameter without an argument resolves to its constraint", () => {
	expect(resolveGenericParameter(constrained, new Map(), "source")).toEqual({ kind: "STRING" });
});

test("A source parameter without a constraint resolves to a wildcard", () => {
	expect(resolveGenericParameter(bare, new Map(), "source")).toEqual({ kind: "ANY" });
});

test("A target parameter never uses its constraint", () => {
	expect(resolveGenericParameter(constrained, new Map(), "target")).toEqual({ kind: "ANY" });
	expect(resolveGenericParameter(bare, new Map(), "target")).toEqual({ kind: "ANY" });
});
