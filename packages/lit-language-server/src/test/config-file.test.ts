import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { findNearestConfigFile, readConfigFile, resolveConfigForFile } from '../config-file.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const configProjectDir = path.join(fixturesDir, 'config-project');
const invalidConfigProjectDir = path.join(fixturesDir, 'invalid-config-project');

describe('findNearestConfigFile', () => {
	test('finds a config file directly in the starting directory', () => {
		expect(findNearestConfigFile(configProjectDir)).toBe(path.join(configProjectDir, 'lit-analyzer.config.json'));
	});

	test('finds the nearest config file walking up from a nested directory with its own config', () => {
		const nestedDir = path.join(configProjectDir, 'nested');
		expect(findNearestConfigFile(nestedDir)).toBe(path.join(nestedDir, 'lit-analyzer.config.json'));
	});

	test('keeps walking up past directories with no config file of their own', () => {
		const deepDir = path.join(configProjectDir, 'nested', 'deep');
		// The nearest config is 'nested/lit-analyzer.config.json', not the
		// outer 'config-project/lit-analyzer.config.json' two levels further up.
		expect(findNearestConfigFile(deepDir)).toBe(path.join(configProjectDir, 'nested', 'lit-analyzer.config.json'));
	});
});

describe('readConfigFile', () => {
	test('parses rule overrides into a full LitAnalyzerConfig', () => {
		const config = readConfigFile(path.join(configProjectDir, 'lit-analyzer.config.json'));

		expect(config.rules['no-noncallable-event-binding']).toBe('off');
		// Untouched fields still get their defaults.
		expect(config.htmlTemplateTags).toEqual([ 'html', 'raw' ]);
	});

	test('throws a clear, file-naming error on invalid JSON', () => {
		const invalidConfigPath = path.join(invalidConfigProjectDir, 'lit-analyzer.config.json');

		expect(() => readConfigFile(invalidConfigPath)).toThrowError(new RegExp(invalidConfigPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	});
});

describe('resolveConfigForFile', () => {
	test('resolves the nested config, not the outer one, for a file nested deeper', () => {
		const resolved = resolveConfigForFile(path.join(configProjectDir, 'nested', 'deep', 'component.ts'));

		expect(resolved.configPath).toBe(path.join(configProjectDir, 'nested', 'lit-analyzer.config.json'));
		expect(resolved.config.rules['no-noncallable-event-binding']).toBe('error');
		expect(resolved.error).toBeUndefined();
	});

	test('falls back to defaults with a reported error for invalid JSON', () => {
		const resolved = resolveConfigForFile(path.join(invalidConfigProjectDir, 'component.ts'));

		expect(resolved.configPath).toBe(path.join(invalidConfigProjectDir, 'lit-analyzer.config.json'));
		expect(resolved.error).toBeDefined();
		// Falls back to the rule's own default ("error"), not the file's
		// (unreadable) intent -- there's no way to know what it was.
		expect(resolved.config.rules['no-noncallable-event-binding']).toBe('error');
	});

	test('falls back to defaults when no config file exists anywhere up the tree', () => {
		// This package's own test helpers directory has no lit-analyzer.config.json
		// anywhere above it within the repository.
		const resolved = resolveConfigForFile(fileURLToPath(new URL('./helpers/does-not-exist.ts', import.meta.url)));

		expect(resolved.configPath).toBeUndefined();
		expect(resolved.error).toBeUndefined();
	});
});
