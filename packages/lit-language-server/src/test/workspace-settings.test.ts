import { makeConfig } from '@arcmantle/lit-analyzer';
import { describe, expect, test } from 'vitest';

import { mergeConfig, parseWorkspaceSettings } from '../workspace-settings.js';

describe('parseWorkspaceSettings', () => {
	test('returns nothing for settings the client did not mark as explicit', () => {
		expect(parseWorkspaceSettings({})).toEqual({});
	});

	test('reads non-rule fields the client marks as explicitly set', () => {
		expect(parseWorkspaceSettings({ strict: true, maxProjectImportDepth: 2 })).toEqual({
			strict:                true,
			maxProjectImportDepth: 2,
		});
	});

	test('reads customHtmlData when present', () => {
		expect(parseWorkspaceSettings({ customHtmlData: './data.json' })).toEqual({ customHtmlData: './data.json' });
	});

	test('reads formatter settings when present', () => {
		expect(parseWorkspaceSettings({ format: { groupBindings: false, newLineTemplate: false } })).toEqual({
			format: { groupBindings: false, newLineTemplate: false },
		});
	});

	test("drops a per-rule 'default' value, treating it as no override", () => {
		expect(parseWorkspaceSettings({ rules: { 'no-unknown-tag-name': 'default', 'no-unknown-property': 'error' } })).toEqual({
			rules: { 'no-unknown-property': 'error' },
		});
	});
});

describe('mergeConfig', () => {
	test('settings override a scalar field from the file config', () => {
		const base = makeConfig({ strict: true });
		expect(mergeConfig(base, { strict: false }).strict).toBe(false);
	});

	test("a field the settings don't mention keeps the file config's value", () => {
		const base = makeConfig({ strict: true });
		expect(mergeConfig(base, {}).strict).toBe(true);
	});

	test('merges rules key by key instead of replacing the map', () => {
		const base = makeConfig({ rules: { 'no-unknown-tag-name': 'off', 'no-noncallable-event-binding': 'off' } });
		const merged = mergeConfig(base, { rules: { 'no-unknown-tag-name': 'error' } });
		expect(merged.rules['no-unknown-tag-name']).toBe('error');
		// A rule the settings don't mention keeps the file config's value,
		// rather than reverting to `makeConfig`'s own default for it.
		expect(merged.rules['no-noncallable-event-binding']).toBe('off');
	});

	test('merges formatter settings key by key instead of replacing the map', () => {
		const base = makeConfig({ format: { groupBindings: false } });
		const merged = mergeConfig(base, { format: { alignBindingAssignments: false } });
		expect(merged.format.groupBindings).toBe(false);
		expect(merged.format.alignBindingAssignments).toBe(false);
		expect(merged.format.newLineTemplate).toBe(true);
		expect(merged.format.newLineBindings).toBe(true);
	});
});
