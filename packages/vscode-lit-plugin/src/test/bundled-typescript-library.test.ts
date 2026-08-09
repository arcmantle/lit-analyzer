import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { BundledTypeScriptLibrary, readBundledTypeScriptLibrary } from '../bundled-typescript-library.js';

describe('readBundledTypeScriptLibrary', () => {
	test('reads a default library from the extension TypeScript installation', async () => {
		const extensionPath = path.resolve(import.meta.dirname, '../..');

		const text = await readBundledTypeScriptLibrary(extensionPath, '/lib.dom.d.ts');

		expect(text).toContain('interface HTMLElement');
	});

	test('reads from an explicitly selected TypeScript SDK', async () => {
		const extensionPath = path.resolve(import.meta.dirname, '../..');
		const libraryDirectory = path.join(extensionPath, 'node_modules', 'typescript', 'lib');
		const library = new BundledTypeScriptLibrary('/unused-extension', libraryDirectory);

		await expect(library.read('/lib.dom.d.ts')).resolves.toContain('interface HTMLElement');
	});

	test('rejects paths outside the TypeScript library directory', async () => {
		const extensionPath = path.resolve(import.meta.dirname, '../..');

		await expect(readBundledTypeScriptLibrary(extensionPath, '/../package.json')).rejects.toThrow(
			'Invalid bundled TypeScript library URI path',
		);
	});

	test('resolves definitions within the bundled default libraries', async () => {
		const extensionPath = path.resolve(import.meta.dirname, '../..');
		const library = new BundledTypeScriptLibrary(extensionPath);
		const text = await library.read('/lib.dom.d.ts');
		const reference = 'interface HTMLAnchorElement extends HTMLElement';
		const position = text.indexOf(reference) + reference.lastIndexOf('HTMLElement');

		const definitions = library.getDefinitions('/lib.dom.d.ts', position);

		expect(definitions[0]?.uriPath).toBe('/lib.dom.d.ts');
		expect(text.slice(definitions[0]?.start, (definitions[0]?.start ?? 0) + (definitions[0]?.length ?? 0))).toBe('HTMLElement');
	});

	test('returns TypeScript quick info within a bundled default library', async () => {
		const extensionPath = path.resolve(import.meta.dirname, '../..');
		const library = new BundledTypeScriptLibrary(extensionPath);
		const text = await library.read('/lib.dom.d.ts');
		const reference = 'interface HTMLAnchorElement extends HTMLElement';
		const position = text.indexOf(reference) + reference.lastIndexOf('HTMLElement');

		const quickInfo = library.getQuickInfo('/lib.dom.d.ts', position);

		expect(quickInfo?.display).toContain('interface HTMLElement');
		expect(text.slice(quickInfo?.start, (quickInfo?.start ?? 0) + (quickInfo?.length ?? 0))).toBe('HTMLElement');
	});
});
