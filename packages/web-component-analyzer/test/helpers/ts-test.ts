import { createRequire } from "node:module";
import { dirname } from "node:path";
import * as tsModule from "typescript";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);

/**
 * The assertion surface the vendored upstream suite was written against.
 *
 * The suite came from ava, where every test receives an `ExecutionContext`.
 * Rather than rewrite roughly 40 test files, this shim exposes the same handful
 * of assertions on top of Vitest's `expect`.
 */
export interface TestContext {
	is(actual: unknown, expected: unknown, message?: string): void;
	true(actual: unknown, message?: string): void;
	truthy(actual: unknown, message?: string): void;
	deepEqual(actual: unknown, expected: unknown, message?: string): void;
	snapshot(actual: unknown, message?: string): void;
	fail(message?: string): void;
	pass(message?: string): void;
	log(...values: unknown[]): void;
}

export const testContext: TestContext = {
	is: (actual, expected, message) => void expect(actual, message).toBe(expected),
	true: (actual, message) => void expect(actual, message).toBe(true),
	truthy: (actual, message) => void expect(actual, message).toBeTruthy(),
	deepEqual: (actual, expected, message) => void expect(actual, message).toEqual(expected),
	snapshot: (actual, message) => void expect(actual, message).toMatchSnapshot(),
	fail: message => expect.fail(message ?? "Test failed"),
	// ava buffers `t.pass` and `t.log` and only surfaces them on failure. Vitest
	// has no equivalent, and the suite calls `t.log` once per asserted member, so
	// honouring them here would bury the real output.
	pass: () => undefined,
	log: () => undefined
};

export type TestImplementation = (t: TestContext) => void | Promise<void>;

/**
 * The pinned analysis compiler.
 *
 * Upstream ran every test against a matrix of TypeScript versions, selected
 * through a `TS_MODULE` environment variable. This repository pins one
 * TypeScript (`ISS_7YF1ZF0W3J84JTQXP6DE079524`), so the matrix collapsed to the
 * single pinned copy, and the environment variable is gone with it.
 */
export function getCurrentTsModule(): typeof tsModule {
	return tsModule;
}

/**
 * Returns the directory of the pinned analysis compiler.
 */
export function getCurrentTsModuleDirectory(): string {
	return dirname(require.resolve("typescript"));
}

function wrap(testFunction: typeof test | typeof test.only | typeof test.skip) {
	return (title: string, implementation: TestImplementation): void => {
		testFunction(`[ts${tsModule.version}] ${title}`, () => implementation(testContext));
	};
}

export const tsTest = Object.assign(wrap(test), {
	only: wrap(test.only),
	skip: wrap(test.skip)
});
