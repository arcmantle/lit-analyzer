import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';
import type { Position } from 'vscode-languageserver/node';

import { type ServerHarness, startServer } from './helpers/server-harness.js';

const codeFixProjectDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'code-fix-project');
const componentPath = path.join(codeFixProjectDir, 'component.ts');
const missingImportPath = path.join(codeFixProjectDir, 'consumer-missing-import.ts');
const typoPath = path.join(codeFixProjectDir, 'consumer-typo.ts');

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

describe('lit-language-server serves code actions over LSP', () => {
	test('a missing import produces a code action that inserts the import statement', async () => {
		harness = await startServer(codeFixProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(missingImportPath);

		const consumerText = fs.readFileSync(missingImportPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		const actions = await harness.getCodeActions(missingImportPath, { start: position, end: position });

		expect(actions).not.toBeNull();
		const fix = actions!.find(action => action.title.includes('Import'));
		expect(fix).toBeDefined();
		expect(fix!.kind).toBe('quickfix');

		const uri = Object.keys(fix!.edit!.changes!)[0];
		expect(uri.endsWith('consumer-missing-import.ts')).toBe(true);
		const edits = fix!.edit!.changes![uri];
		expect(edits).toHaveLength(1);
		expect(edits[0].newText).toContain('import "./component";');
	});

	test('a misspelled tag name produces a code action that renames both the opening and closing tag', async () => {
		harness = await startServer(codeFixProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(typoPath);

		const consumerText = fs.readFileSync(typoPath, 'utf8');
		const position = positionOf(consumerText, '<my-elment', 1);

		const actions = await harness.getCodeActions(typoPath, { start: position, end: position });

		expect(actions).not.toBeNull();
		const fix = actions!.find(action => action.title.includes('my-element'));
		expect(fix).toBeDefined();

		const uri = Object.keys(fix!.edit!.changes!)[0];
		expect(uri.endsWith('consumer-typo.ts')).toBe(true);
		const edits = fix!.edit!.changes![uri];
		expect(edits).toHaveLength(2);
		expect(edits[0].newText).toBe('my-element');
		expect(edits[1].newText).toBe('my-element');
	});

	test('no code action at a position with nothing to fix', async () => {
		harness = await startServer(codeFixProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(missingImportPath);

		// The very start of the file, inside the "Pretending this is..." comment.
		const actions = await harness.getCodeActions(missingImportPath, {
			start: { line: 0, character: 0 },
			end:   { line: 0, character: 0 },
		});

		expect(actions == null || actions.length === 0).toBe(true);
	});

	test('no code action when the client asks for a kind this server never returns', async () => {
		harness = await startServer(codeFixProjectDir);

		await harness.openFile(componentPath);
		await harness.openFile(missingImportPath);

		const consumerText = fs.readFileSync(missingImportPath, 'utf8');
		const position = positionOf(consumerText, '<my-element', 1);

		// A position that does have a quick fix available, but the client only
		// wants "refactor" actions here -- this server only ever returns
		// "quickfix", so it must return nothing rather than the fix anyway.
		const actions = await harness.getCodeActions(missingImportPath, { start: position, end: position }, [ 'refactor' ]);

		expect(actions == null || actions.length === 0).toBe(true);
	});
});
