import type * as ts from 'typescript';
import { describe, expect, test } from 'vitest';

import { hasLegacyPluginEntry } from '../legacy-tsconfig-plugin.js';

function compilerOptions(plugins?: unknown[]): ts.CompilerOptions {
	return { plugins } as unknown as ts.CompilerOptions;
}

describe('hasLegacyPluginEntry', () => {
	test("true when compilerOptions.plugins has a 'ts-lit-plugin' entry", () => {
		expect(
			hasLegacyPluginEntry(compilerOptions([ { name: 'ts-lit-plugin', rules: { 'no-noncallable-event-binding': 'off' } } ])),
		).toBe(true);
	});

	test('false when there is no plugins field', () => {
		expect(hasLegacyPluginEntry(compilerOptions(undefined))).toBe(false);
	});

	test("false when plugins exist but none is named 'ts-lit-plugin'", () => {
		expect(hasLegacyPluginEntry(compilerOptions([ { name: 'some-other-plugin' } ]))).toBe(false);
	});
});
