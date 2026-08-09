import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const litProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'lit-project');

let harness: ServerHarness | undefined;

beforeAll(async () => {
	harness = await startServer(litProjectDir);
});

afterAll(() => {
	harness?.dispose();
	harness = undefined;
});

// This harness spawns the compiled server as a real child process over
// stdio and talks real LSP to it -- no VS Code, no display server, so it
// runs the same in CI as it does locally.
describe('LSP integration test harness', () => {
	test('asserts a known diagnostic for a fixture file', async () => {
		const diagnostics = await harness.openFile(path.join(litProjectDir, 'component.ts'));

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].code).toBe('no-noncallable-event-binding');
	});

	test('asserts no diagnostics for a clean file', async () => {
		const diagnostics = await harness.openFile(path.join(litProjectDir, 'clean.ts'));

		expect(diagnostics).toEqual([]);
	});
});
