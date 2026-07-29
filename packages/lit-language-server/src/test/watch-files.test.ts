import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const watchProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'watch-project');
const consumerPath = path.join(watchProjectDir, 'consumer.ts');
const componentPath = path.join(watchProjectDir, 'new-component.ts');
const renamedComponentPath = path.join(watchProjectDir, 'renamed-component.ts');
const excludedDir = path.join(watchProjectDir, 'excluded');
const excludedComponentPath = path.join(excludedDir, 'excluded-component.ts');

const componentSource =
	'export class NewComponent extends HTMLElement {}\n\ncustomElements.define("new-component", NewComponent);\n';

let harness: ServerHarness | undefined;

afterEach(async () => {
	harness?.dispose();
	harness = undefined;
	// Each test creates and/or renames component.ts itself, so the fixture
	// is restored to its checked-in state (no component file) regardless of
	// which of the two ends up on disk.
	await Promise.all([
		fs.rm(componentPath, { force: true }),
		fs.rm(renamedComponentPath, { force: true }),
		fs.rm(excludedDir, { recursive: true, force: true }),
	]);
});

describe('watching for created, deleted and renamed component files', () => {
	test('creating a component file makes its tag known in an already-open dependent document', async () => {
		harness = await startServer(watchProjectDir);

		const beforeCreate = await harness.openFile(consumerPath);
		expect(beforeCreate.map(d => d.code)).toContain('no-unknown-tag-name');

		await harness.createFile(componentPath, componentSource);
		const afterCreate = await harness.waitForNextDiagnostics(consumerPath);

		expect(afterCreate.map(d => d.code)).not.toContain('no-unknown-tag-name');
	});

	test('deleting a component file makes its tag unknown again in an already-open dependent document', async () => {
		await fs.writeFile(componentPath, componentSource, 'utf8');
		harness = await startServer(watchProjectDir);

		const beforeDelete = await harness.openFile(consumerPath);
		expect(beforeDelete.map(d => d.code)).not.toContain('no-unknown-tag-name');

		await harness.deleteFile(componentPath);
		const afterDelete = await harness.waitForNextDiagnostics(consumerPath);

		expect(afterDelete.map(d => d.code)).toContain('no-unknown-tag-name');
	});

	test('renaming a component file keeps its tag known, now resolved from the new file', async () => {
		await fs.writeFile(componentPath, componentSource, 'utf8');
		harness = await startServer(watchProjectDir);

		const beforeRename = await harness.openFile(consumerPath);
		expect(beforeRename.map(d => d.code)).not.toContain('no-unknown-tag-name');

		// The old path is gone and the new one has taken over, together, in
		// one rename -- a rebuild that only handled one half would leave the
		// tag unknown either way.
		await harness.renameFile(componentPath, renamedComponentPath);
		const afterRename = await harness.waitForNextDiagnostics(consumerPath);

		expect(afterRename.map(d => d.code)).not.toContain('no-unknown-tag-name');
	});

	test('creating a component file in a directory the tsconfig excludes does not make its tag known', async () => {
		await fs.mkdir(excludedDir, { recursive: true });
		harness = await startServer(watchProjectDir);

		const beforeCreate = await harness.openFile(consumerPath);
		expect(beforeCreate.map(d => d.code)).toContain('no-unknown-tag-name');

		await harness.createFile(excludedComponentPath, componentSource);

		// The excluded file's own project never changes what it resolves to,
		// so there is no further `publishDiagnostics` triggered by the
		// watcher itself to wait for. A same-content `changeFile` forces one
		// fresh, observable analysis run for `consumerPath` without relying
		// on anything the watcher notification was supposed to cause.
		const consumerText = await fs.readFile(consumerPath, 'utf8');
		await harness.changeFile(consumerPath, consumerText);
		const afterCreate = await harness.waitForNextDiagnostics(consumerPath);

		expect(afterCreate.map(d => d.code)).toContain('no-unknown-tag-name');
	});
});
