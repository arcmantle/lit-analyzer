import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const definitionProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'definition-project');
const componentPath = path.join(definitionProjectDir, 'component.ts');
const consumerPath = path.join(definitionProjectDir, 'consumer.ts');

let harness: ServerHarness | undefined;

afterEach(() => {
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

describe('lit-language-server serves prepare-rename over LSP', () => {
	test('prepare-rename on a custom element tag usage returns its span', async () => {
		harness = await startServer(definitionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		const result = await harness.getPrepareRename(consumerPath, position);

		expect(result).not.toBeNull();
		const range = result as { start: Position; end: Position; };
		const line = consumerText.split('\n')[range.start.line];
		expect(line.slice(range.start.character, range.end.character)).toBe('my-element');
	});

	test('prepare-rename rejects a position that cannot be renamed', async () => {
		harness = await startServer(definitionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		// The very start of the file, inside the "Pretending this is..." comment.
		const result = await harness.getPrepareRename(consumerPath, { line: 0, character: 0 });

		expect(result).toBeNull();
	});
});
