import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const componentProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'component-project');
const componentPath = path.join(componentProjectDir, 'component.ts');
const consumerPath = path.join(componentProjectDir, 'consumer.ts');

let harness: ServerHarness | undefined;

afterEach(() => {
	harness?.dispose();
	harness = undefined;
});

describe('editing a component definition updates diagnostics in a file that uses it, with no reload', () => {
	test("adding then removing a property is reflected in a dependent open document's diagnostics", async () => {
		harness = await startServer(componentProjectDir);

		const consumerDiagnostics = await harness.openFile(consumerPath);
		expect(consumerDiagnostics.map(d => d.code)).toContain('no-unknown-property');

		await harness.openFile(componentPath);

		await harness.changeFile(
			componentPath,
			`export class MyElement extends HTMLElement {\n\tfoo = "";\n}\n\ncustomElements.define("my-element", MyElement);\n`,
		);
		const afterAddingProperty = await harness.waitForNextDiagnostics(consumerPath);
		expect(afterAddingProperty.map(d => d.code)).not.toContain('no-unknown-property');

		await harness.changeFile(
			componentPath,
			`export class MyElement extends HTMLElement {}\n\ncustomElements.define("my-element", MyElement);\n`,
		);
		const afterRemovingProperty = await harness.waitForNextDiagnostics(consumerPath);
		expect(afterRemovingProperty.map(d => d.code)).toContain('no-unknown-property');
	});

	test('renaming a custom element tag makes an existing usage unknown in a dependent open document', async () => {
		harness = await startServer(componentProjectDir);

		const consumerDiagnostics = await harness.openFile(consumerPath);
		expect(consumerDiagnostics).not.toContainEqual(expect.objectContaining({
			code:    'no-unknown-tag-name',
			message: 'Unknown tag <my-element>.',
		}));

		await harness.openFile(componentPath);

		await harness.changeFile(
			componentPath,
			`export class MyElement extends HTMLElement {}\n\ncustomElements.define("my-renamed-element", MyElement);\n`,
		);
		const afterRename = await harness.waitForNextDiagnostics(consumerPath);
		expect(afterRename).toContainEqual(expect.objectContaining({
			code:    'no-unknown-tag-name',
			message: expect.stringContaining('Unknown tag <my-element>.'),
		}));
	});

	test("closing an unsaved component edit reverts a dependent open document's diagnostics to match disk content", async () => {
		harness = await startServer(componentProjectDir);

		const consumerDiagnostics = await harness.openFile(consumerPath);
		expect(consumerDiagnostics.map(d => d.code)).toContain('no-unknown-property');

		await harness.openFile(componentPath);

		// Edited to add the property, but never written to disk.
		await harness.changeFile(
			componentPath,
			`export class MyElement extends HTMLElement {\n\tfoo = "";\n}\n\ncustomElements.define("my-element", MyElement);\n`,
		);
		const afterAddingProperty = await harness.waitForNextDiagnostics(consumerPath);
		expect(afterAddingProperty.map(d => d.code)).not.toContain('no-unknown-property');

		// Closed without saving -- the on-disk component still has no property.
		await harness.closeFile(componentPath);
		const afterClose = await harness.waitForNextDiagnostics(consumerPath);
		expect(afterClose.map(d => d.code)).toContain('no-unknown-property');
	});
});
