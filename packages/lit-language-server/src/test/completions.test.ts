import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const completionProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'completion-project');
const componentPath = path.join(completionProjectDir, 'component.ts');
const consumerPath = path.join(completionProjectDir, 'consumer.ts');

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

describe('lit-language-server serves completions over LSP', () => {
	test('tag name completion suggests the registered custom element', async () => {
		harness = await startServer(completionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		const completions = await harness.getCompletions(consumerPath, position);

		expect(completions).not.toBeNull();
		expect(completions!.some(item => item.label === 'my-element')).toBe(true);
	});

	test("plain attribute completion suggests a built-in attribute and the global 'slot' attribute", async () => {
		harness = await startServer(completionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, 'my-element ', 'my-element '.length);

		const completions = await harness.getCompletions(consumerPath, position);

		expect(completions).not.toBeNull();
		expect(completions!.some(item => item.label === 'id')).toBe(true);
		expect(completions!.some(item => item.label === 'slot')).toBe(true);
	});

	test("property completion suggests the class field bound with '.'", async () => {
		harness = await startServer(completionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, 'element .', 'element .'.length);

		const completions = await harness.getCompletions(consumerPath, position);

		expect(completions).not.toBeNull();
		expect(completions!.some(item => item.label === '.foo')).toBe(true);
	});

	test("event completion suggests the dispatched event bound with '@'", async () => {
		harness = await startServer(completionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, 'element @', 'element @'.length);

		const completions = await harness.getCompletions(consumerPath, position);

		expect(completions).not.toBeNull();
		expect(completions!.some(item => item.label === '@my-event')).toBe(true);
	});

	test('resolving a property completion fills in its documentation', async () => {
		harness = await startServer(completionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, 'element .', 'element .'.length);

		const completions = await harness.getCompletions(consumerPath, position);
		const fooCompletion = completions!.find(item => item.label === '.foo')!;

		expect(fooCompletion.documentation).toBeUndefined();

		const resolved = await harness.resolveCompletion(fooCompletion);

		expect((resolved.documentation as { value: string; }).value).toContain('foo');
	});

	test('no completions at a position with nothing to suggest', async () => {
		harness = await startServer(completionProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		// The very start of the file, inside the "Pretending this is..." comment.
		const completions = await harness.getCompletions(consumerPath, { line: 0, character: 0 });

		expect(completions == null || completions.length === 0).toBe(true);
	});
});
