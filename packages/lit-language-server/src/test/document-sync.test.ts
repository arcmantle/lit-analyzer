import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';
import type { InitializeParams, PublishDiagnosticsParams } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

const litProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'lit-project');
const cleanPath = path.join(litProjectDir, 'clean.ts');
const componentPath = path.join(litProjectDir, 'component.ts');

function initializeParamsWithRoot(rootPath: string): InitializeParams {
	return { processId: null, rootUri: pathToFileURL(rootPath).toString(), capabilities: {} };
}

function didOpenParams(uri: string, text: string) {
	return { textDocument: { uri, languageId: 'typescript', version: 1, text } };
}

function didChangeParams(uri: string, version: number, text: string) {
	return { textDocument: { uri, version }, contentChanges: [ { text } ] };
}

/**
 * `publishDiagnostics` is a notification, not a response to a request, so
 * there's nothing to await directly. Poll instead of a fixed delay.
 */
async function waitForPublishCount(published: PublishDiagnosticsParams[], count: number, retries = 50): Promise<void> {
	for (let i = 0; i < retries; i++) {
		if (published.length >= count)
			return;

		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

describe('lit-language-server tracks unsaved document content', () => {
	test('an edit sent via didChange, without saving, is reflected in the published diagnostics', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		const uri = pathToFileURL(cleanPath).toString();

		await client.sendRequest('initialize', initializeParamsWithRoot(litProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(uri, fs.readFileSync(cleanPath, 'utf8')));
		await waitForPublishCount(published, 1);
		expect(published[0].diagnostics).toHaveLength(0);

		// Edited in the editor, but never written to disk.
		await client.sendNotification('textDocument/didChange', didChangeParams(uri, 2, fs.readFileSync(componentPath, 'utf8')));
		await waitForPublishCount(published, 2);

		const [ , afterEdit ] = published;
		expect(afterEdit.diagnostics.map(d => d.code)).toContain('no-noncallable-event-binding');
	});

	test('closing a document clears its diagnostics without analyzing it again', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		const uri = pathToFileURL(componentPath).toString();

		await client.sendRequest('initialize', initializeParamsWithRoot(litProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(uri, fs.readFileSync(componentPath, 'utf8')));
		await waitForPublishCount(published, 1);
		expect(published[0].diagnostics.map(d => d.code)).toContain('no-noncallable-event-binding');

		// Edited to remove the error, but never written to disk.
		await client.sendNotification('textDocument/didChange', didChangeParams(uri, 2, fs.readFileSync(cleanPath, 'utf8')));
		await waitForPublishCount(published, 2);
		expect(published[1].diagnostics).toHaveLength(0);

		// A closed document no longer needs diagnostics. Other open documents
		// that depend on it are reanalyzed separately against disk content.
		await client.sendNotification('textDocument/didClose', { textDocument: { uri } });
		await waitForPublishCount(published, 3);
		expect(published[2].diagnostics).toEqual([]);
	});
});
