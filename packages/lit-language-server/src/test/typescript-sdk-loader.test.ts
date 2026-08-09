import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { selectedTypeScriptModulePath } from '../typescript-sdk-loader.js';

describe('selectedTypeScriptModulePath', () => {
	test('maps TypeScript package imports to the selected SDK', () => {
		expect(selectedTypeScriptModulePath('typescript', '/sdk/lib')).toBe(path.join('/sdk/lib', 'typescript.js'));
		expect(selectedTypeScriptModulePath('typescript/lib/tsserverlibrary.js', '/sdk/lib')).toBe(
			path.join('/sdk/lib', 'tsserverlibrary.js'),
		);
	});

	test('does not redirect unrelated imports', () => {
		expect(selectedTypeScriptModulePath('node:path', '/sdk/lib')).toBeUndefined();
	});

	test('loads TypeScript from the selected SDK', () => {
		const sdkDirectory = mkdtempSync(path.join(os.tmpdir(), 'lit-typescript-sdk-'));
		try {
			writeFileSync(path.join(sdkDirectory, 'typescript.js'), "module.exports = { version: 'selected-sdk' };\n");
			const loaderUrl = pathToFileURL(path.resolve(import.meta.dirname, '../typescript-sdk-loader.ts')).href;
			const script = `
				import { registerTypeScriptSdk } from ${ JSON.stringify(loaderUrl) };
				registerTypeScriptSdk(${ JSON.stringify(sdkDirectory) });
				const ts = await import('typescript');
				console.log(ts.default.version);
			`;

			expect(execFileSync(
				process.execPath,
				[ '--input-type=module', '--eval', script ],
				{ encoding: 'utf8' },
			).trim()).toBe('selected-sdk');
		}
		finally {
			rmSync(sdkDirectory, { recursive: true, force: true });
		}
	});
});
