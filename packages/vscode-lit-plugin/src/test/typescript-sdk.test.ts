import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolveTypeScriptSdkDirectory } from '../typescript-sdk.js';

describe('resolveTypeScriptSdkDirectory', () => {
	test('resolves a workspace-relative TypeScript lib directory', () => {
		const packageDirectory = path.resolve(import.meta.dirname, '../..');

		expect(resolveTypeScriptSdkDirectory('node_modules/typescript/lib', packageDirectory)).toBe(
			path.join(packageDirectory, 'node_modules/typescript/lib'),
		);
	});

	test('returns undefined when no SDK is configured', () => {
		expect(resolveTypeScriptSdkDirectory(undefined)).toBeUndefined();
		expect(resolveTypeScriptSdkDirectory('  ')).toBeUndefined();
	});

	test('rejects a directory that is not a TypeScript SDK', () => {
		expect(() => resolveTypeScriptSdkDirectory('.', import.meta.dirname)).toThrow('is missing typescript.js');
	});
});
