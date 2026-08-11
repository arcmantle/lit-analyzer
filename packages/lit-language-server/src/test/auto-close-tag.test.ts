import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const autoCloseTagProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'auto-close-tag-project');
const consumerPath = path.join(autoCloseTagProjectDir, 'consumer.ts');

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

describe('lit-language-server serves auto-closing tags over LSP', () => {
	test('typing > after an opening tag inserts its closing tag', async () => {
		harness = await startServer(autoCloseTagProjectDir);

		await harness.openFile(consumerPath);

		// Simulates the editor having just inserted the `>` that completes
		// `<div>` -- the tag isn't closed yet, the same state the document is
		// in the instant a real editor would fire `onTypeFormatting`.
		const unclosedText = 'declare const html: any;\n\nhtml`<div>`;\n';
		await harness.changeFile(consumerPath, unclosedText);

		const position = positionOf(unclosedText, '<div>', '<div>'.length);
		const edits = await harness.getOnTypeFormattingEdits(consumerPath, position, '>');

		expect(edits).not.toBeNull();
		expect(edits).toHaveLength(1);
		expect(edits![0].newText).toBe('</div>');
		expect(edits![0].range).toEqual({ start: position, end: position });
	});

	test('no auto-closing tag outside a lit template', async () => {
		harness = await startServer(autoCloseTagProjectDir);

		await harness.openFile(consumerPath);

		// The start of the file, inside the leading `declare` statement.
		const edits = await harness.getOnTypeFormattingEdits(consumerPath, { line: 0, character: 0 }, '>');

		expect(edits).toBeNull();
	});

	test('no edits for a character other than >', async () => {
		harness = await startServer(autoCloseTagProjectDir);

		await harness.openFile(consumerPath);

		const consumerText = 'declare const html: any;\n\nhtml`<div>`;\n';
		const position = positionOf(consumerText, '<div>', '<div>'.length);
		const edits = await harness.getOnTypeFormattingEdits(consumerPath, position, 'a');

		expect(edits).toBeNull();
	});

	test('formats Lit bindings through document formatting', async () => {
		harness = await startServer(autoCloseTagProjectDir);

		await harness.openFile(consumerPath);
		await harness.changeFile(consumerPath, [
			'declare const html: any;',
			'',
			'html`<my-element @change="onChange" attribute="value" .property="property"></my-element>`;',
			'',
		].join('\n'));

		const edits = await harness.getFormattingEdits(consumerPath);

		expect(edits).toHaveLength(1);
		expect(edits![0].newText).toBe([
			'<my-element',
			'  .property = "property"',
			'  attribute = "value"',
			'  @change   = "onChange"',
			'></my-element>',
		].join('\n'));
	});
});
