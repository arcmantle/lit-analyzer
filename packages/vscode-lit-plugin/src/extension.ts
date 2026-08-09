import * as vscode from 'vscode';

import { BundledTypeScriptLibrary } from './bundled-typescript-library.js';
import { ColorProvider } from './color-provider.js';
import { LanguageServerHandle, registerLanguageServer } from './language-server-client.js';
import { resolveTypeScriptSdkDirectory } from './typescript-sdk.js';

/** The extension's public API, reached through `vscode.extensions.getExtension(...).exports`. */
export interface ExtensionApi {
	languageServer: LanguageServerHandle;
}

const analyzeCommandId = 'lit-plugin.analyze';
const restartLanguageServerCommandId = 'lit-plugin.restartLanguageServer';
const bundledTypeScriptLibraryLanguageId = 'lit-analyzer-typescript-library';

let defaultAnalyzeGlob = 'src';

const colorProvider = new ColorProvider();

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
	const configuredSdkPath = vscode.workspace.getConfiguration('lit-plugin').get<string>('typescript.tsdk');
	const workspaceDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	let typescriptSdkDirectory: string | undefined;
	try {
		typescriptSdkDirectory = resolveTypeScriptSdkDirectory(configuredSdkPath, workspaceDirectory);
	}
	catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(`Lit Analyzer could not use the configured TypeScript SDK. It will use the bundled SDK. ${ errorMessage }`);
	}

	const bundledTypeScriptLibrary = new BundledTypeScriptLibrary(context.extensionPath, typescriptSdkDirectory);
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('lit-analyzer-lib', {
		provideTextDocumentContent: uri => bundledTypeScriptLibrary.read(uri.path),
	}));
	const useBundledTypeScriptLibraryLanguage = (document: vscode.TextDocument) => {
		if (document.uri.scheme === 'lit-analyzer-lib' && document.languageId !== bundledTypeScriptLibraryLanguageId)
			void vscode.languages.setTextDocumentLanguage(document, bundledTypeScriptLibraryLanguageId);
	};
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(useBundledTypeScriptLibraryLanguage));
	vscode.workspace.textDocuments.forEach(useBundledTypeScriptLibraryLanguage);
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(
		{ scheme: 'lit-analyzer-lib', language: bundledTypeScriptLibraryLanguageId },
		{
			provideDefinition: async (document, position) => Promise.all(
				bundledTypeScriptLibrary.getDefinitions(document.uri.path, document.offsetAt(position)).map(async definition => {
					const targetUri = vscode.Uri.parse(`lit-analyzer-lib:${ definition.uriPath }`);
					const targetDocument = await vscode.workspace.openTextDocument(targetUri);

					return new vscode.Location(targetUri, new vscode.Range(
						targetDocument.positionAt(definition.start),
						targetDocument.positionAt(definition.start + definition.length),
					));
				}),
			),
		},
	));
	context.subscriptions.push(vscode.languages.registerHoverProvider(
		{ scheme: 'lit-analyzer-lib', language: bundledTypeScriptLibraryLanguageId },
		{
			provideHover: (document, position) => {
				const quickInfo = bundledTypeScriptLibrary.getQuickInfo(document.uri.path, document.offsetAt(position));
				if (quickInfo == null)
					return undefined;

				const signature = new vscode.MarkdownString().appendCodeblock(quickInfo.display, 'typescript');
				const contents = quickInfo.documentation === ''
					? [ signature ]
					: [ signature, new vscode.MarkdownString(quickInfo.documentation) ];

				return new vscode.Hover(contents, new vscode.Range(
					document.positionAt(quickInfo.start),
					document.positionAt(quickInfo.start + quickInfo.length),
				));
			},
		},
	));

	const languageServer = registerLanguageServer(context, typescriptSdkDirectory);
	const extensionApi: ExtensionApi = { languageServer };

	// Subscribe to the analyze command
	context.subscriptions.push(vscode.commands.registerCommand(analyzeCommandId, handleAnalyzeCommand));
	context.subscriptions.push(vscode.commands.registerCommand(restartLanguageServerCommandId, async () => {
		try {
			await languageServer.restart();
		}
		catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			void vscode.window.showErrorMessage(`Lit Analyzer could not restart the language server. ${ errorMessage }`);
			throw error;
		}
	}));

	// Register a color provider
	const registration = vscode.languages.registerColorProvider(
		[
			{ scheme: 'file', language: 'typescript' },
			{ scheme: 'file', language: 'javascript' },
		],
		colorProvider,
	);
	context.subscriptions.push(registration);

	return extensionApi;
}

function handleAnalyzeCommand() {
	vscode.window
		.showInputBox({
			value:       defaultAnalyzeGlob,
			prompt:      'Please enter a directory/path/glob to analyze',
			placeHolder: 'directory/path/glob',
		})
		.then((glob: string | undefined) => {
			if (glob == null)
				return;

			defaultAnalyzeGlob = glob;

			const cliCommand = `npx lit-analyzer "${ glob }"`;
			const terminal = vscode.window.createTerminal('lit-analyzer');
			terminal.sendText(cliCommand, true);
			terminal.show(true);
		});
}
