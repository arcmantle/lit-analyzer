import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ts from 'typescript';
import { afterEach, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const componentProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'component-project');
const componentPath = path.join(componentProjectDir, 'component.ts');
const consumerPath = path.join(componentProjectDir, 'consumer.ts');

const definitionProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'definition-project');
const definitionComponentPath = path.join(definitionProjectDir, 'component.ts');
const definitionConsumerPath = path.join(definitionProjectDir, 'consumer.ts');

const libraryDefinitionProjectDir
	= path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'library-definition-project');
const libraryDefinitionConsumerPath = path.join(libraryDefinitionProjectDir, 'consumer.ts');

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

describe('lit-language-server serves go-to-definition over LSP', () => {
	test('definition from a custom element tag usage lands on its class declaration', async () => {
		harness = await startServer(componentProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		const links = await harness.getDefinition(consumerPath, position);

		expect(links).not.toBeNull();
		expect(links).toHaveLength(1);
		const [ link ] = links!;
		expect(link.targetUri.endsWith('component.ts')).toBe(true);
	});

	test('definitions from native attributes land on their DOM properties', async () => {
		harness = await startServer(componentProjectDir);

		await harness.openFile(consumerPath);

		const consumerText = fs.readFileSync(consumerPath, 'utf8');
		for (const [ marker, propertyName ] of [
			[ 'title="Native', 'title' ],
			[ 'aria-label="Native', 'ariaLabel' ],
			[ 'disabled class=', 'disabled' ],
			[ 'class="Native', 'className' ],
		] as const) {
			const links = await harness.getDefinition(consumerPath, positionOf(consumerText, marker, 1));

			expect(links, marker).not.toBeNull();
			expect(links, marker).toHaveLength(1);
			const [ link ] = links!;
			expect(link.targetUri, marker).toBe('lit-analyzer-lib:/lib.dom.d.ts');

			const targetText = fs.readFileSync(path.join(path.dirname(ts.getDefaultLibFilePath({})), 'lib.dom.d.ts'), 'utf8');
			const targetLine = targetText.split('\n')[link.targetRange.start.line];
			expect(targetLine, marker).toContain(`${ propertyName }:`);
		}
	});

	test('definition from a library custom element follows its declaration map to source', async () => {
		harness = await startServer(libraryDefinitionProjectDir);

		await harness.openFile(libraryDefinitionConsumerPath);

		const consumerText = fs.readFileSync(libraryDefinitionConsumerPath, 'utf8');
		const position = positionOf(consumerText, '<library-element', 1);

		const links = await harness.getDefinition(libraryDefinitionConsumerPath, position);

		expect(links).not.toBeNull();
		expect(links).toHaveLength(1);
		const [ link ] = links!;
		expect(fileURLToPath(link.targetUri)).toBe(path.join(libraryDefinitionProjectDir, 'library', 'src', 'component.ts'));
	});

	test('no definition at a position with nothing to define', async () => {
		harness = await startServer(componentProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(consumerPath);

		// The very start of the file, inside the "Pretending this is..." comment.
		const links = await harness.getDefinition(consumerPath, { line: 0, character: 0 });

		expect(links == null || links.length === 0).toBe(true);
	});

	test('definition from a property binding lands on the class field it binds to', async () => {
		harness = await startServer(definitionProjectDir);

		await harness.openFile(definitionComponentPath);
		await harness.openFile(definitionConsumerPath);

		const consumerText = fs.readFileSync(definitionConsumerPath, 'utf8');
		const position = positionOf(consumerText, '.foo=', 1);

		const links = await harness.getDefinition(definitionConsumerPath, position);

		expect(links).not.toBeNull();
		expect(links).toHaveLength(1);
		const [ link ] = links!;
		expect(link.targetUri.endsWith('component.ts')).toBe(true);

		const componentText = fs.readFileSync(definitionComponentPath, 'utf8');
		const fooLine = componentText.split('\n').findIndex(line => line.includes('foo ='));
		expect(link.targetRange.start.line).toBe(fooLine);
	});

	test('definition from an event binding lands on the method that dispatches it', async () => {
		harness = await startServer(definitionProjectDir);

		await harness.openFile(definitionComponentPath);
		await harness.openFile(definitionConsumerPath);

		const consumerText = fs.readFileSync(definitionConsumerPath, 'utf8');
		const position = positionOf(consumerText, '@my-event', 1);

		const links = await harness.getDefinition(definitionConsumerPath, position);

		expect(links).not.toBeNull();
		expect(links).toHaveLength(1);
		const [ link ] = links!;
		expect(link.targetUri.endsWith('component.ts')).toBe(true);
	});
});
