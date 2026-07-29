import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';
import type { InitializeParams, PublishDiagnosticsParams } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

const legacyPluginProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'legacy-plugin-project');
const tsconfigPath = path.join(legacyPluginProjectDir, 'tsconfig.json');
const componentPath = path.join(legacyPluginProjectDir, 'component.ts');

function initializeParamsWithRoot(rootPath: string): InitializeParams {
	return { processId: null, rootUri: pathToFileURL(rootPath).toString(), capabilities: {} };
}

function didOpenParams(filePath: string) {
	return {
		textDocument: {
			uri:        pathToFileURL(filePath).toString(),
			languageId: 'typescript',
			version:    1,
			text:       fs.readFileSync(filePath, 'utf8'),
		},
	};
}

async function waitForPublishedDiagnostics(published: PublishDiagnosticsParams[], retries = 50): Promise<void> {
	for (let i = 0; i < retries; i++) {
		if (published.length > 0)
			return;

		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

describe("the old tsconfig 'ts-lit-plugin' plugin entry is detected and reported", () => {
	test('a clear message names the tsconfig file and says to move to lit-analyzer.config.json', async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(legacyPluginProjectDir));

		const message = logMessages.find(m => m.includes(tsconfigPath) && m.includes('lit-analyzer.config.json'));
		expect(message).toBeDefined();
		expect(message).toContain('lit-analyzer.config.json');
	});

	test('the message appears once per session, not once per opened file', async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(legacyPluginProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(componentPath));
		await waitForPublishedDiagnostics(published);
		published.length = 0;

		await client.sendNotification('textDocument/didOpen', didOpenParams(componentPath));
		await waitForPublishedDiagnostics(published);

		const matches = logMessages.filter(m => m.includes(tsconfigPath) && m.includes('lit-analyzer.config.json'));
		expect(matches).toHaveLength(1);
	});

	test('no old settings are silently applied: the rule the old entry turns off is still enforced', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(legacyPluginProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(componentPath));
		await waitForPublishedDiagnostics(published);

		expect(published).toHaveLength(1);
		expect(published[0].diagnostics.map(d => d.code)).toEqual([ 'no-noncallable-event-binding' ]);
	});
});
