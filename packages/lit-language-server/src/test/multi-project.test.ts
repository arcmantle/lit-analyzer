import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';
import type { InitializeParams, PublishDiagnosticsParams } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

const multiProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'multi-project');
const projectADir = path.join(multiProjectDir, 'project-a');
const projectBDir = path.join(multiProjectDir, 'project-b');
const aPath = path.join(projectADir, 'a.ts');
const bPath = path.join(projectBDir, 'b.ts');
const sharedPath = path.join(projectBDir, 'shared.ts');

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

function didCloseParams(filePath: string) {
	return { textDocument: { uri: pathToFileURL(filePath).toString() } };
}

/**
 * `publishDiagnostics` is a notification, not a response to `didOpen`, so
 * there's nothing to await directly. Polls until at least `count` diagnostics
 * notifications have been published in total across every open document.
 */
async function waitUntil(predicate: () => boolean, retries = 50): Promise<void> {
	for (let i = 0; i < retries; i++) {
		if (predicate())
			return;

		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

describe('lit-language-server supports more than one TypeScript project in a workspace', () => {
	test('a two-project fixture produces correct, isolated diagnostics in both', async () => {
		const client = connectToServer();
		const publishedByUri: Map<string, PublishDiagnosticsParams['diagnostics']> = new Map();
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			publishedByUri.set(params.uri, params.diagnostics);
		});

		// The workspace root has no tsconfig.json of its own -- each project's
		// tsconfig is only found by walking up from its own open document.
		await client.sendRequest('initialize', initializeParamsWithRoot(multiProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(aPath));
		await client.sendNotification('textDocument/didOpen', didOpenParams(bPath));

		await waitUntil(() => publishedByUri.size === 2);

		const aDiagnostics = publishedByUri.get(pathToFileURL(aPath).toString()) ?? [];
		const bDiagnostics = publishedByUri.get(pathToFileURL(bPath).toString()) ?? [];

		expect(aDiagnostics.map(d => d.code)).toContain('no-noncallable-event-binding');
		expect(aDiagnostics.map(d => d.code)).not.toContain('no-expressionless-property-binding');

		expect(bDiagnostics.map(d => d.code)).toContain('no-expressionless-property-binding');
		expect(bDiagnostics.map(d => d.code)).not.toContain('no-noncallable-event-binding');
	});

	test("a file listed by two projects' tsconfig always resolves to its own nearest tsconfig", async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(multiProjectDir));

		// Boots project-a first -- its own tsconfig also lists shared.ts, via a
		// relative path into project-b's directory.
		await client.sendNotification('textDocument/didOpen', didOpenParams(aPath));
		await waitUntil(() => logMessages.some(message => message.includes(path.join(projectADir, 'tsconfig.json'))));

		await client.sendNotification('textDocument/didOpen', didOpenParams(sharedPath));
		await waitUntil(() => logMessages.some(message => message.includes(path.join(projectBDir, 'tsconfig.json'))));

		expect(logMessages).toContainEqual(expect.stringContaining(`via ${ path.join(projectBDir, 'tsconfig.json') }`));
	});

	test('closing every open document under a project releases it', async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(multiProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(aPath));
		await waitUntil(() => logMessages.some(message => message.includes(path.join(projectADir, 'tsconfig.json'))));

		await client.sendNotification('textDocument/didClose', didCloseParams(aPath));

		await waitUntil(() =>
			logMessages.some(message => message.includes(`released the project at ${ path.join(projectADir, 'tsconfig.json') }`)));

		expect(logMessages).toContainEqual(
			expect.stringContaining(`released the project at ${ path.join(projectADir, 'tsconfig.json') }`),
		);
	});
});
