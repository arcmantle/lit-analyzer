import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const configProjectDir = path.join(fixturesDir, 'config-project');
const invalidConfigProjectDir = path.join(fixturesDir, 'invalid-config-project');

let harness: ServerHarness | undefined;

afterEach(() => {
	harness?.dispose();
	harness = undefined;
});

describe('lit-analyzer.config.json is read for diagnostics', () => {
	test('disabling a rule in the config file disables it', async () => {
		harness = await startServer(configProjectDir);

		// The outer config disables 'no-noncallable-event-binding', and this
		// file has no nearer config of its own.
		const diagnostics = await harness.openFile(path.join(configProjectDir, 'outer-component.ts'));

		expect(diagnostics).toEqual([]);
	});

	test('the nearest config file wins in a monorepo, overriding the outer one', async () => {
		harness = await startServer(configProjectDir);

		// The nested config re-enables the rule the outer one disables.
		const nestedDiagnostics = await harness.openFile(path.join(configProjectDir, 'nested', 'component.ts'));
		expect(nestedDiagnostics.map(d => d.code)).toEqual([ 'no-noncallable-event-binding' ]);

		// A file two levels down, with no config of its own, still finds the
		// nested one rather than stopping at the first directory without a
		// config file or skipping straight to the outer one.
		const deepDiagnostics = await harness.openFile(path.join(configProjectDir, 'nested', 'deep', 'component.ts'));
		expect(deepDiagnostics.map(d => d.code)).toEqual([ 'no-noncallable-event-binding' ]);
	});

	test('editing the config file re-runs diagnostics for open documents without a reload', async () => {
		const configPath = path.join(configProjectDir, 'nested', 'lit-analyzer.config.json');
		const originalContent = fs.readFileSync(configPath, 'utf8');

		try {
			harness = await startServer(configProjectDir);
			const filePath = path.join(configProjectDir, 'nested', 'component.ts');

			const before = await harness.openFile(filePath);
			expect(before.map(d => d.code)).toEqual([ 'no-noncallable-event-binding' ]);

			// Disable the rule that was previously on, without restarting the
			// server or re-opening the file.
			fs.writeFileSync(configPath, JSON.stringify({ rules: { 'no-noncallable-event-binding': 'off' } }));

			const after = await harness.waitForNextDiagnostics(filePath);
			expect(after).toEqual([]);
		}
		finally {
			fs.writeFileSync(configPath, originalContent);
		}
	});

	test('stops watching a config file once no open document uses it', async () => {
		const server = await startServer(configProjectDir);
		harness = server;

		const nestedFile = path.join(configProjectDir, 'nested', 'component.ts');
		const deepFile = path.join(configProjectDir, 'nested', 'deep', 'component.ts');
		const configPath = path.join(configProjectDir, 'nested', 'lit-analyzer.config.json');

		// Both files share the same nearest config file.
		await server.openFile(nestedFile);
		await server.openFile(deepFile);

		// One of the two documents still uses the config: it must stay watched.
		await server.closeFile(nestedFile);
		expect(
			server.logMessages.some(message => message.includes(configPath) && message.includes('stopped watching')),
		).toBe(false);

		// The last document referencing it closes: the watcher must stop.
		await server.closeFile(deepFile);
		await vi.waitFor(() => {
			expect(
				server.logMessages.some(message => message.includes(configPath) && message.includes('stopped watching')),
			).toBe(true);
		});
	});

	test('invalid JSON in the config file reports a clear error rather than falling back silently', async () => {
		harness = await startServer(invalidConfigProjectDir);

		// Diagnostics are still published (default config), but the server
		// must say loudly that the config file itself couldn't be read.
		const diagnostics = await harness.openFile(path.join(invalidConfigProjectDir, 'component.ts'));
		expect(diagnostics.map(d => d.code)).toEqual([ 'no-noncallable-event-binding' ]);

		const configPath = path.join(invalidConfigProjectDir, 'lit-analyzer.config.json');
		expect(harness.logMessages.some(message => message.includes(configPath))).toBe(true);
	});
});
