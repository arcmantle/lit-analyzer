import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const projectDir = path.join(fixturesDir, 'workspace-settings-project');
const componentFile = path.join(projectDir, 'component.ts');

let harness: ServerHarness | undefined;

afterEach(() => {
	harness?.dispose();
	harness = undefined;
});

describe('VS Code settings sync over workspace/configuration', () => {
	test('workspace settings override the config file, merging rules rather than replacing the map', async () => {
		// The config file disables both rules below. The workspace setting
		// only re-enables one of them.
		harness = await startServer(projectDir, {
			workspaceSettings: { rules: { 'no-unknown-tag-name': 'error' } },
		});

		const diagnostics = await harness.openFile(componentFile);

		// "no-unknown-tag-name" comes from the setting overriding the file.
		// "no-noncallable-event-binding" stays off, from the file -- proving
		// the setting's rule map didn't wipe it out.
		expect(diagnostics.map(d => d.code)).toEqual([ 'no-unknown-tag-name' ]);
	});

	test('changing a workspace setting re-runs diagnostics without a reload', async () => {
		harness = await startServer(projectDir, { workspaceSettings: {} });

		const before = await harness.openFile(componentFile);
		expect(before).toEqual([]);

		await harness.setWorkspaceSettings({ rules: { 'no-unknown-tag-name': 'error' } });

		const after = await harness.waitForNextDiagnostics(componentFile);
		expect(after.map(d => d.code)).toEqual([ 'no-unknown-tag-name' ]);
	});
});
