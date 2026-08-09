import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const hoverProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'hover-project');
const componentPath = path.join(hoverProjectDir, 'component.ts');
const consumerPath = path.join(hoverProjectDir, 'consumer.ts');

let harness: ServerHarness | undefined;

beforeAll(async () => {
	harness = await startServer(hoverProjectDir);
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

describe('lit-language-server serves hover over LSP', () => {
	test("hover on a tag name shows the element's quick info as markdown", async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		const hover = await harness.getHover(consumerPath, position);

		expect(hover).not.toBeNull();
		expect((hover!.contents as { value: string; }).value).toContain('my-element');
	});

	test('hover on a plain attribute shows its quick info', async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, 'id=', 0);

		const hover = await harness.getHover(consumerPath, position);

		expect(hover).not.toBeNull();
		expect((hover!.contents as { value: string; }).value).toContain('id');
	});

	test("hover on a property binding shows the class field's quick info", async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '.foo=', 1);

		const hover = await harness.getHover(consumerPath, position);

		expect(hover).not.toBeNull();
		expect((hover!.contents as { value: string; }).value).toContain('foo');
	});

	test("hover on an event binding shows the event's quick info", async () => {
		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '@my-event', 1);

		const hover = await harness.getHover(consumerPath, position);

		expect(hover).not.toBeNull();
		expect((hover!.contents as { value: string; }).value).toContain('my-event');
	});

	test('no hover at a position with nothing to show', async () => {
		// The very start of the file, inside the "Pretending this is..." comment.
		const hover = await harness.getHover(consumerPath, { line: 0, character: 0 });

		expect(hover == null).toBe(true);
	});
});
