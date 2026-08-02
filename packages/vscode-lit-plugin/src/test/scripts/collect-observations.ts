// Runs inside the VS Code extension host.
//
// `vscode` is injected by the extension host at runtime and cannot be required
// from an ordinary Node process, so anything touching that API has to live
// here. This module does no asserting: it drives the editor and records what it
// observed, and the Vitest tests in ../extension.test.ts make the judgements.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import { State } from 'vscode-languageclient/node';

import type { ExtensionApi } from '../../extension.js';

export interface Observations {
	installedExtensionIds:         string[];
	missingElementTypeDiagnostics: string[];
	missingImport: {
		beforeFix:       string[];
		clearedAfterFix: boolean;
	};
	completions: {
		tagLabels:      string[];
		propertyLabels: string[];
	};
	languageServer: {
		runsByDefault: boolean;
	};
}

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'src', 'test', 'fixtures');

/**
 * Waits for the TypeScript language server to produce diagnostics for a document.
 */
async function waitForDiagnostics(uri: vscode.Uri, retries = 1000): Promise<vscode.Diagnostic[]> {
	for (let i = 0; i < retries; i++) {
		const diagnostics = vscode.languages.getDiagnostics(uri);
		if (diagnostics.length > 0)
			return diagnostics;

		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`No diagnostics found for ${ uri.fsPath }`);
}

/**
 * Waits for a document's diagnostics to disappear.
 *
 * Kept short on purpose. Today this always exhausts, because adding the import
 * does not clear the diagnostic -- see the skipped assertion in
 * ../extension.test.ts and ISS_4H4W1Q8QX39NJSX2E3KQ5XMYSS. Waiting longer only
 * makes every run slower for an outcome we already know.
 */
async function waitForDiagnosticsToClear(uri: vscode.Uri, retries = 50): Promise<boolean> {
	for (let i = 0; i < retries; i++) {
		if (vscode.languages.getDiagnostics(uri).length === 0)
			return true;

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	return false;
}

async function openFixture(name: string) {
	const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(FIXTURES, name)));
	const editor = await vscode.window.showTextDocument(doc);

	return { doc, editor };
}

async function observeMissingElementType(): Promise<string[]> {
	const config = vscode.workspace.getConfiguration();
	await config.update('lit-plugin.logging', 'verbose', true);
	await config.update('lit-plugin.rules.no-missing-element-type-definition', 'error', true);

	const { doc } = await openFixture('missing-elem-type.ts');
	const diagnostics = await waitForDiagnostics(doc.uri);

	return diagnostics.map(d => d.message);
}

async function observeMissingImport(): Promise<Observations['missingImport']> {
	const config = vscode.workspace.getConfiguration();
	await config.update('lit-plugin.logging', 'verbose', true);
	await config.update('lit-plugin.rules.no-missing-import', 'error', true);

	const { doc, editor } = await openFixture('missing-import.ts');
	const beforeFix = (await waitForDiagnostics(doc.uri)).map(d => d.message);

	// Add the missing import, which should clear the diagnostic.
	await editor.insertSnippet(new vscode.SnippetString("import './my-other-element';\n"), doc.lineAt(0).range.start);

	return { beforeFix, clearedAfterFix: await waitForDiagnosticsToClear(doc.uri) };
}

async function observeCompletions(): Promise<Observations['completions']> {
	const { doc, editor } = await openFixture('completions.ts');

	async function completionLabelsContaining(expected: string): Promise<string[]> {
		for (let i = 0; i < 1000; i++) {
			const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
				'vscode.executeCompletionItemProvider',
				doc.uri,
				editor.selection.active,
			);
			const labels = (completions?.items ?? []).map(item =>
				String(typeof item.label === 'string' ? item.label : item.label.label));
			if (labels.includes(expected))
				return labels;

			await new Promise(resolve => setTimeout(resolve, 100));
		}
		throw new Error(`No completion '${ expected }' found`);
	}

	// Locate the two probe points by content rather than by hardcoded line and
	// character offsets. The offsets used to be hardcoded, and a reformat that
	// added two blank lines to the fixture silently shifted them onto the wrong
	// constructs, which made this observer poll for completions that could never
	// appear there.
	const lines = doc.getText().split('\n');

	const endOfLine = (line: number) => new vscode.Position(line, lines[line]!.length);

	const findLine = (predicate: (line: string) => boolean, what: string): number => {
		const index = lines.findIndex(predicate);
		if (index === -1)
			throw new Error(`Could not find ${ what } in completions.ts`);


		return index;
	};

	// The partial tag `<com`, where the tag name is still being typed. The patterns
	// are anchored to the start of the line so that prose mentioning these tags in a
	// comment cannot match instead.
	const tagPosition = endOfLine(findLine(line => /^\s*<com$/.test(line), 'the partial tag `<com`'));
	editor.selection = new vscode.Selection(tagPosition, tagPosition);
	const tagLabels = await completionLabelsContaining('complete-me');

	// The blank continuation line inside the open `<complete-me ...>` tag, where
	// typing `.` asks for property completions.
	const openTagLine = findLine(line => /^\s*<complete-me$/.test(line), 'the open `<complete-me>` tag');
	const propertyPosition = endOfLine(openTagLine + 1);
	editor.selection = new vscode.Selection(propertyPosition, propertyPosition);
	await editor.edit(builder => builder.insert(editor.selection.active, '.'));
	const propertyLabels = await completionLabelsContaining('.prop1');

	return { tagLabels, propertyLabels };
}

/**
 * Waits for the language client's state to reach `expected`, polling rather
 * than relying on `onDidChangeState` so this reads the same way as the other
 * observers here.
 */
async function waitForLanguageServerState(getState: () => State, expected: State, retries = 100): Promise<State> {
	for (let i = 0; i < retries; i++) {
		const state = getState();
		if (state === expected)
			return state;

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	return getState();
}

async function observeLanguageServer(): Promise<Observations['languageServer']> {
	const extension = vscode.extensions.getExtension<ExtensionApi>('arcmantle.lit-plugin')!;
	const { getState } = extension.exports.languageServer;

	// The language server is the extension's only path now: it starts on
	// activation, with no setting to gate it.
	const runsByDefault = (await waitForLanguageServerState(getState, State.Running)) === State.Running;

	return { runsByDefault };
}

/**
 * `@vscode/test-electron` calls this once VS Code is up.
 */
export async function run(): Promise<void> {
	const outputPath = process.env.LIT_PLUGIN_OBSERVATIONS;
	if (outputPath == null)
		throw new Error('LIT_PLUGIN_OBSERVATIONS must point at the file to write observations to');


	const observations: Observations = {
		installedExtensionIds:         vscode.extensions.all.map(extension => extension.id),
		missingElementTypeDiagnostics: await observeMissingElementType(),
		missingImport:                 await observeMissingImport(),
		completions:                   await observeCompletions(),
		languageServer:                await observeLanguageServer(),
	};

	fs.writeFileSync(outputPath, JSON.stringify(observations), 'utf8');
}
