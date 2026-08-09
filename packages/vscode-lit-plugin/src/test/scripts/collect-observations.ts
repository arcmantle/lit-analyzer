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
		beforeFix: string[];
	};
	completions: {
		tagLabels:      string[];
		propertyLabels: string[];
	};
	languageServer: {
		runsByDefault:    boolean;
		runsAfterRestart: boolean;
	};
	selectedTypeScriptSdk: {
		configuredDirectory:            string | null;
		virtualLibraryContainsProperty: boolean;
		definitionScheme:               string | null;
		definitionLine:                 string | null;
	};
	virtualTypeScriptLibrary: {
		scheme:            string;
		languageId:        string;
		selectorScore:     number;
		containsDomType:   boolean;
		diagnostics:       string[];
		definitionSchemes: string[];
		definition:        { scheme: string; lineText: string; } | null;
		hoverText:         string;
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

	const { doc } = await openFixture('missing-import.ts');
	const beforeFix = (await waitForDiagnostics(doc.uri)).map(d => d.message);

	return { beforeFix };
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
	await Promise.all([
		vscode.commands.executeCommand('lit-plugin.restartLanguageServer'),
		vscode.commands.executeCommand('lit-plugin.restartLanguageServer'),
	]);
	const runsAfterRestart = (await waitForLanguageServerState(getState, State.Running)) === State.Running;

	return { runsByDefault, runsAfterRestart };
}

async function observeSelectedTypeScriptSdk(): Promise<Observations['selectedTypeScriptSdk']> {
	const { doc } = await openFixture('selected-typescript-sdk.ts');
	const marker = 'selected TypeScript SDK';
	const libraryDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse('lit-analyzer-lib:/lib.dom.d.ts'));
	const position = doc.positionAt(doc.getText().indexOf('title=') + 1);
	const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
		'vscode.executeDefinitionProvider',
	doc.uri,
	position,
	);
	const definition = definitions?.[0];
	const targetUri = definition == null
		? undefined
		: 'targetUri' in definition ? definition.targetUri : definition.uri;
	const targetRange = definition == null
		? undefined
		: 'targetRange' in definition ? definition.targetRange : definition.range;
	const targetDocument = targetUri == null ? undefined : await vscode.workspace.openTextDocument(targetUri);

	return {
		configuredDirectory:            vscode.workspace.getConfiguration('lit-plugin').get<string>('typescript.tsdk') ?? null,
		virtualLibraryContainsProperty: libraryDocument.getText().includes(marker),
		definitionScheme:               targetUri?.scheme ?? null,
		definitionLine:                 targetDocument == null || targetRange == null
			? null
			: targetDocument.lineAt(targetRange.start.line).text,
	};
}

async function observeVirtualTypeScriptLibrary(): Promise<Observations['virtualTypeScriptLibrary']> {
	const document = await vscode.workspace.openTextDocument(vscode.Uri.parse('lit-analyzer-lib:/lib.dom.d.ts'));
	await vscode.window.showTextDocument(document);
	for (let attempt = 0; attempt < 100 && document.languageId !== 'lit-analyzer-typescript-library'; attempt++)
		await new Promise(resolve => setTimeout(resolve, 10));
	const reference = 'interface HTMLAnchorElement extends HTMLElement';
	const referenceOffset = document.getText().indexOf(reference) + reference.lastIndexOf('HTMLElement');
	const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
		'vscode.executeDefinitionProvider',
	document.uri,
	document.positionAt(referenceOffset),
	);
	const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
		'vscode.executeHoverProvider',
		document.uri,
		document.positionAt(referenceOffset),
	);
	const firstDefinition = definitions?.[0];
	const targetUri = firstDefinition == null
		? undefined
		: 'targetUri' in firstDefinition
			? firstDefinition.targetUri
			: firstDefinition.uri;

	const targetRange = firstDefinition == null
		? undefined
		: 'targetRange' in firstDefinition
			? firstDefinition.targetRange
			: firstDefinition.range;

	const targetDocument = targetUri == null
		? undefined
		: await vscode.workspace.openTextDocument(targetUri);

	return {
		scheme:        document.uri.scheme,
		languageId:    document.languageId,
		selectorScore: vscode.languages.match(
			{
				scheme:   'lit-analyzer-lib',
				language: 'lit-analyzer-typescript-library',
			},
			document,
		),
		containsDomType:   document.getText().includes('interface HTMLElement'),
		diagnostics:       vscode.languages.getDiagnostics(document.uri).map(diagnostic => diagnostic.message),
		definitionSchemes: (definitions ?? []).map(definition =>
			('targetUri' in definition ? definition.targetUri : definition.uri).scheme),
		definition: targetDocument == null || targetRange == null
			? null
			: { scheme: targetDocument.uri.scheme, lineText: targetDocument.lineAt(targetRange.start.line).text },
		hoverText: (hovers ?? []).flatMap(hover => hover.contents).map(content =>
			typeof content === 'string' ? content : content.value).join('\n'),
	};
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
		selectedTypeScriptSdk:         await observeSelectedTypeScriptSdk(),
		virtualTypeScriptLibrary:      await observeVirtualTypeScriptLibrary(),
	};

	fs.writeFileSync(outputPath, JSON.stringify(observations), 'utf8');
}
