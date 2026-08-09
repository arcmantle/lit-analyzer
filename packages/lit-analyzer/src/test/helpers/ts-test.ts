import { dirname } from 'path';
import * as tsModule from 'typescript';
import { expect, test } from 'vitest';

/**
 * The assertions the tests use.
 *
 * This is deliberately the small surface the suite actually relies on, rather
 * than a general-purpose assertion library, so the test runner stays swappable
 * from this one file.
 */
export interface TestContext {
	is(actual: unknown, expected: unknown, message?: string): void;
	deepEqual(actual: unknown, expected: unknown, message?: string): void;
	true(actual: unknown, message?: string): void;
	log(...values: unknown[]): void;
}

const testContext: TestContext = {
	is(actual, expected, message) {
		expect(actual, message).toBe(expected);
	},
	deepEqual(actual, expected, message) {
		// `toStrictEqual` rather than `toEqual`: it keeps `{ a: undefined }` distinct
		// from `{}`, which is the comparison these tests were written against.
		expect(actual, message).toStrictEqual(expected);
	},
	true(actual, message) {
		expect(actual, message).toBe(true);
	},
	log(...values) {
		// eslint-disable-next-line no-console
		console.log(...values);
	},
};

type TestImplementation = (t: TestContext) => void | Promise<void>;
type TestFunction = (title: string, implementation: TestImplementation) => void;

/**
 * Returns the analysis compiler the tests run against
 */
export function getCurrentTsModule(): typeof tsModule {
	return tsModule;
}

/**
 * Returns the directory of the analysis compiler
 */
export function getCurrentTsModuleDirectory(): string {
	return dirname(require.resolve('typescript'));
}

/**
 * Wraps a test so that it runs against the analysis compiler
 * @param testFunction
 */
function wrapTest(testFunction: TestFunction): TestFunction {
	return (title, implementation) => {
		testFunction(title, () => implementation(testContext));
	};
}

/**
 * Wrap the test module in these helper functions
 */
export const tsTest = Object.assign(wrapTest(test), {
	only: wrapTest(test.only),
	skip: wrapTest(test.skip),
});
