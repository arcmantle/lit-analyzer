import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';
import type { InitializeParams, PublishDiagnosticsParams } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

const litProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'lit-project');
const componentPath = path.join(litProjectDir, 'component.ts');
const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');

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

/**
 * `publishDiagnostics` is a notification, not a response to `didOpen`, so
 * there's nothing to await directly. Poll instead of a fixed delay.
 */
async function waitForPublishedDiagnostics(published: PublishDiagnosticsParams[], retries = 50): Promise<void> {
	for (let i = 0; i < retries; i++) {
		if (published.length > 0)
			return;

		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

describe('lit-language-server serves lit diagnostics over LSP', () => {
	test('publishes a diagnostic for the opened document, with rule id, severity and a range inside the template', async () => {
		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(litProjectDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(componentPath));
		await waitForPublishedDiagnostics(published);

		expect(published).toHaveLength(1);
		const [ diagnosticsParams ] = published;
		expect(diagnosticsParams.uri).toBe(pathToFileURL(componentPath).toString());
		expect(diagnosticsParams.diagnostics).toHaveLength(1);

		const [ diagnostic ] = diagnosticsParams.diagnostics;
		expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
		expect(diagnostic.code).toBe('no-noncallable-event-binding');
		expect(diagnostic.message).toContain('non-callable');

		// The binding sits on the `<button @click="...">` line, inside the
		// template literal, not at the start of the file.
		const fileText = fs.readFileSync(componentPath, 'utf8');
		const templateLine = fileText.split('\n').findIndex(line => line.includes('@click'));
		expect(diagnostic.range.start.line).toBe(templateLine);
		expect(diagnostic.range.start.character).toBeGreaterThan(0);
	});

	// The literal acceptance target: opening the repo's own dogfood file
	// produces a lit diagnostic, the same way it would with the setting on in
	// the real extension.
	test('verified against dev/: opening dev/src/my-element-1.ts publishes a lit diagnostic', async () => {
		const devDir = path.join(repoRoot, 'dev');
		const devFile = path.join(devDir, 'src', 'my-element-1.ts');

		const client = connectToServer();
		const published: PublishDiagnosticsParams[] = [];
		client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
			published.push(params);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(devDir));
		await client.sendNotification('textDocument/didOpen', didOpenParams(devFile));
		await waitForPublishedDiagnostics(published);

		expect(published).toHaveLength(1);
		const [ diagnosticsParams ] = published;
		expect(diagnosticsParams.diagnostics.length).toBeGreaterThan(0);

		// `'this is a test'` as a static `observedAttributes` entry is not a
		// valid attribute name regardless of lit-element version or config, so
		// this specific diagnostic is the stable part of the assertion.
		expect(diagnosticsParams.diagnostics.map(d => d.code)).toContain('no-invalid-attribute-name');
	});
});
