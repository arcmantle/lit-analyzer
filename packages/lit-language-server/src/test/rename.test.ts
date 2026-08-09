import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const definitionProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'definition-project');
const componentPath = path.join(definitionProjectDir, 'component.ts');
const consumerPath = path.join(definitionProjectDir, 'consumer.ts');

let harness: ServerHarness | undefined;

beforeAll(async () => {
	harness = await startServer(definitionProjectDir);
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

describe('lit-language-server serves rename over LSP', () => {
	test('renaming a custom element tag updates its definition and every template usage, across files', async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		const edit = await harness.getRename(consumerPath, position, 'your-element');

		expect(edit).not.toBeNull();
		const changes = edit!.changes!;
		const componentUri = Object.keys(changes).find(uri => uri.endsWith('component.ts'))!;
		const consumerUri = Object.keys(changes).find(uri => uri.endsWith('consumer.ts'))!;

		expect(componentUri).toBeDefined();
		expect(consumerUri).toBeDefined();

		// One rename in the definition file (the `customElements.define` call).
		expect(changes[componentUri]).toHaveLength(1);
		expect(changes[componentUri][0].newText).toBe('your-element');

		// Two usages in the consumer file, one per `<my-element>` tag pair.
		expect(changes[consumerUri].length).toBeGreaterThanOrEqual(2);
		for (const textEdit of changes[consumerUri])
			expect(textEdit.newText).toBe('your-element');
	});

	test('rename returns nothing at a position with nothing to rename', async () => {
		// The very start of the file, inside the "Pretending this is..." comment.
		const edit = await harness.getRename(consumerPath, { line: 0, character: 0 }, 'your-element');

		expect(edit == null || Object.keys(edit.changes ?? {}).length === 0).toBe(true);
	});
});
