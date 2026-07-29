import { describe, expect, test } from 'vitest';

import { filterExplicitLitPluginSettings, type InspectableConfiguration, isExplicitlySet } from '../workspace-settings-filter.js';

/** Simulates `vscode.workspace.getConfiguration(...)` for a set of keys the user explicitly set. */
function explicitlySetConfig(explicit: Record<string, unknown>): InspectableConfiguration {
	return {
		get:     key => explicit[key],
		inspect: key => (key in explicit ? { workspaceValue: explicit[key] } : undefined),
	};
}

describe('filterExplicitLitPluginSettings', () => {
	test('keeps a field the user explicitly set', () => {
		expect(filterExplicitLitPluginSettings(explicitlySetConfig({ disable: true }))).toEqual({ disable: true });
	});

	test('drops a field VS Code reports only via its schema default', () => {
		// `get` still returns the schema default, but `inspect` shows no scope
		// ever set it -- the case `withConfigValue`/this replacement exists for.
		const config: InspectableConfiguration = {
			get:     () => -1,
			inspect: () => undefined,
		};
		expect(filterExplicitLitPluginSettings(config)).toEqual({});
	});

	test('merges only the rules the user explicitly set', () => {
		expect(filterExplicitLitPluginSettings(explicitlySetConfig({ 'rules.no-unknown-tag-name': 'error' }))).toEqual({
			rules: { 'no-unknown-tag-name': 'error' },
		});
	});
});

describe('isExplicitlySet', () => {
	test('is false when inspect finds no value at any scope', () => {
		expect(isExplicitlySet({ get: () => undefined, inspect: () => ({}) }, 'strict')).toBe(false);
	});

	test('is true when inspect finds a workspace-scoped value', () => {
		expect(isExplicitlySet({ get: () => true, inspect: () => ({ workspaceValue: true }) }, 'strict')).toBe(true);
	});
});
