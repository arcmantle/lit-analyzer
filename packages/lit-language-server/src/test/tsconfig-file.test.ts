import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { findNearestTsconfig, parseTsconfig } from '../tsconfig-file.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const discoveryProjectDir = path.join(fixturesDir, 'tsconfig-discovery');

describe('findNearestTsconfig', () => {
	test('finds a tsconfig directly in the starting directory', () => {
		expect(findNearestTsconfig(discoveryProjectDir)).toBe(path.join(discoveryProjectDir, 'tsconfig.json'));
	});

	test('keeps walking up past directories with no tsconfig of their own', () => {
		const deepDir = path.join(discoveryProjectDir, 'nested', 'deep');
		expect(findNearestTsconfig(deepDir)).toBe(path.join(discoveryProjectDir, 'tsconfig.json'));
	});
});

describe('parseTsconfig', () => {
	test("resolves an 'extends' chain to a relative tsconfig", () => {
		const parsed = parseTsconfig(path.join(discoveryProjectDir, 'extends-relative', 'tsconfig.json'));

		// 'strict' and 'target' come from the extended base; 'module' is this
		// file's own override.
		expect(parsed.options.strict).toBe(true);
		expect(parsed.options.module).toBe(1 /* ts.ModuleKind.CommonJS */);
		expect(parsed.fileNames.map(fileName => path.basename(fileName))).toEqual([ 'a.ts' ]);
	});

	test("resolves an 'extends' chain into node_modules", () => {
		const parsed = parseTsconfig(path.join(discoveryProjectDir, 'extends-node-modules', 'tsconfig.json'));

		expect(parsed.options.strict).toBe(true);
		expect(parsed.fileNames.map(fileName => path.basename(fileName))).toEqual([ 'a.ts' ]);
	});
});
