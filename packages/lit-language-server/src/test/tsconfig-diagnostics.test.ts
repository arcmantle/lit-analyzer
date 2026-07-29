import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const tsconfigProjectDir = path.join(fixturesDir, 'tsconfig-project');

let harness: ServerHarness | undefined;

afterEach(() => {
	harness?.dispose();
	harness = undefined;
});

describe('tsconfig.json is discovered, parsed and watched', () => {
	test('editing the tsconfig re-runs diagnostics for open documents without a reload', async () => {
		const tsconfigPath = path.join(tsconfigProjectDir, 'tsconfig.json');
		const originalContent = fs.readFileSync(tsconfigPath, 'utf8');

		try {
			harness = await startServer(tsconfigProjectDir);
			const filePath = path.join(tsconfigProjectDir, 'component.ts');

			// Not strict yet: 'string | null' is assignable to the native 'id'
			// attribute's 'string' type.
			const before = await harness.openFile(filePath);
			expect(before).toEqual([]);

			// Turn strictNullChecks on, without restarting the server or
			// re-opening the file.
			fs.writeFileSync(
				tsconfigPath,
				JSON.stringify({ compilerOptions: { target: 'es2019', module: 'commonjs', strict: true } }),
			);

			const after = await harness.waitForNextDiagnostics(filePath);
			expect(after.map(d => d.code)).toContain('no-nullable-attribute-binding');
		}
		finally {
			fs.writeFileSync(tsconfigPath, originalContent);
		}
	});

	test('invalid JSON in an edited tsconfig keeps the previous, working project instead of losing it', async () => {
		const tsconfigPath = path.join(tsconfigProjectDir, 'tsconfig.json');
		const originalContent = fs.readFileSync(tsconfigPath, 'utf8');

		try {
			harness = await startServer(tsconfigProjectDir);
			const filePath = path.join(tsconfigProjectDir, 'component.ts');

			await harness.openFile(filePath);

			// Broken edit: the rebuild must fail loudly rather than silently
			// swapping in a broken (or empty) project.
			fs.writeFileSync(tsconfigPath, '{ not valid json');

			const after = await harness.waitForNextDiagnostics(filePath);
			// Still reflects the last working tsconfig (non-strict), not a
			// crash and not an empty project.
			expect(after).toEqual([]);
			expect(harness.logMessages.some(message => message.includes(tsconfigPath))).toBe(true);
		}
		finally {
			fs.writeFileSync(tsconfigPath, originalContent);
		}
	});
});
