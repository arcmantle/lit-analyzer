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

function wait(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

describe('lit-language-server debounces analysis for fast typing', () => {
	test('a burst of didChange notifications produces one analysis run for the final state, not one per keystroke', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		const uri = pathToFileURL(componentPath).toString();
		const componentText = fs.readFileSync(componentPath, 'utf8');
		const cleanText = fs.readFileSync(cleanPath, 'utf8');

		await client.sendRequest('initialize', initializeParamsWithRoot(litProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(uri, componentText));
		await waitForPublishCount(published, 1);
		expect(published[0].diagnostics.map(d => d.code)).toContain('no-noncallable-event-binding');

		// A burst of rapid keystrokes, all landing well within the debounce
		// window -- ending on the error-free content.
		for (let i = 0; i < 5; i++) {
			await client.sendNotification(
				'textDocument/didChange',
				didChangeParams(uri, i + 2, `${ componentText }\n// edit ${ i }`),
			);
		}

		await client.sendNotification('textDocument/didChange', didChangeParams(uri, 7, cleanText));

		// Long enough for the debounce delay to settle and a single run to publish.
		await wait(600);
		// No further publishes should trickle in afterwards.
		const settledCount = published.length;
		await wait(400);

		expect(published).toHaveLength(settledCount);
		expect(published.length).toBeLessThan(7); // 1 (open) + up to a couple of runs, never one per keystroke (6 changes)
		expect(published[published.length - 1].diagnostics).toHaveLength(0);
	});
});
