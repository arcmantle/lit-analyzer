import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const signatureHelpProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'signature-help-project');
const componentPath = path.join(signatureHelpProjectDir, 'component.ts');
const consumerPath = path.join(signatureHelpProjectDir, 'consumer.ts');

let harness: ServerHarness | undefined;

beforeAll(async () => {
	harness = await startServer(signatureHelpProjectDir);
	await harness.openFile(componentPath);
	await harness.openFile(consumerPath);
});

afterAll(() => {
	harness?.dispose();
	harness = undefined;
});

/**
 * Finds the line containing `marker` (the first one, top to bottom) and
 * returns a `Position` at the start of `marker` on that line, offset by
 * `withinMarker` characters -- so a test can point "inside the word" without
 * hardcoding line/character numbers that silently go stale if the fixture is
 * edited.
 */
function positionOf(fileText: string, marker: string, withinMarker = 0): Position {
	const lines = fileText.split('\n');
	const line = lines.findIndex(text => text.includes(marker));
	if (line === -1)
		throw new Error(`Marker ${ JSON.stringify(marker) } not found in fixture text`);

	return { line, character: lines[line].indexOf(marker) + withinMarker };
}

describe('lit-language-server serves signature help over LSP', () => {
	test("shows a directive call's own signature inside a template", async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '{ active', 1);

		const signatureHelp = await harness.getSignatureHelp(consumerPath, position);

		expect(signatureHelp).not.toBeNull();
		expect(signatureHelp!.signatures).toHaveLength(1);
		expect(signatureHelp!.signatures[0].label).toContain('classMap');
		expect(signatureHelp!.signatures[0].label).toContain('classInfo');
	});

	test("does not show the html tag function's own signature", async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, 'class="', 1);

		const signatureHelp = await harness.getSignatureHelp(consumerPath, position);

		expect(signatureHelp).toBeNull();
	});

	test('no signature help outside a lit template', async () => {
		// The start of the file, inside the leading `import` statement.
		const signatureHelp = await harness.getSignatureHelp(consumerPath, { line: 0, character: 0 });

		expect(signatureHelp == null || signatureHelp.signatures.length === 0).toBe(true);
	});
});
