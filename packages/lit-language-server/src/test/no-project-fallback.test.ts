import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { InitializeParams, PublishDiagnosticsParams } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

function initializeParamsWithRoot(rootPath: string): InitializeParams {
	return { processId: null, rootUri: pathToFileURL(rootPath).toString(), capabilities: {} };
}

function didOpenParams(uri: string, text: string) {
	return { textDocument: { uri, languageId: 'typescript', version: 1, text } };
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

describe('lit-language-server falls back to an inferred project for a file with no tsconfig.json anywhere above it', () => {
	// Outside the repo entirely -- a path inside it would always eventually
	// walk up into this monorepo's own tsconfig.json.
	let outsideDir: string;

	beforeEach(() => {
		outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-project-fallback-'));
	});

	afterEach(() => {
		fs.rmSync(outsideDir, { recursive: true, force: true });
	});

	test('a standalone file with a lit template gets real diagnostics', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		const fileName = path.join(outsideDir, 'standalone.ts');
		// A string bound to an event listener is never callable, so this
		// always triggers 'no-noncallable-event-binding', the same fixture
		// content `lit-project/component.ts` uses -- deliberately chosen
		// because that rule defaults to "error" whether or not the project
		// is in strict mode, so it doesn't depend on config wiring this
		// server doesn't do for an inferred project either.
		const text = [
			'// Pretending this is the Lit html function.',
			'declare const html: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;',
			'html`<button @click="${"not a function"}"></button>`;',
		].join('\n');
		fs.writeFileSync(fileName, text);

		const uri = pathToFileURL(fileName).toString();

		const initializeResult = await client.sendRequest('initialize', initializeParamsWithRoot(outsideDir));
		expect(initializeResult).toHaveProperty('capabilities');

		await client.sendNotification('textDocument/didOpen', didOpenParams(uri, text));
		await waitForPublishCount(published, 1);

		expect(published).toHaveLength(1);
		expect(published[0].diagnostics.map(d => d.code)).toContain('no-noncallable-event-binding');
	});

	test('a standalone file with no lit issues gets no crash and no diagnostics', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		const fileName = path.join(outsideDir, 'standalone.ts');
		const text = 'export const value = 1;';
		fs.writeFileSync(fileName, text);

		const uri = pathToFileURL(fileName).toString();

		await client.sendRequest('initialize', initializeParamsWithRoot(outsideDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(uri, text));
		await waitForPublishCount(published, 1);

		expect(published[0].diagnostics).toHaveLength(0);
	});
});
