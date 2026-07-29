import * as vscode from 'vscode';

import { ColorProvider } from './color-provider.js';
import { LanguageServerHandle, registerLanguageServer } from './language-server-client.js';

/** The extension's public API, reached through `vscode.extensions.getExtension(...).exports`. */
export interface ExtensionApi {
	languageServer: LanguageServerHandle;
}

const analyzeCommandId = 'lit-plugin.analyze';

let defaultAnalyzeGlob = 'src';

const colorProvider = new ColorProvider();

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
	const languageServer = registerLanguageServer(context);
	const extensionApi: ExtensionApi = { languageServer };

	// Subscribe to the analyze command
	context.subscriptions.push(vscode.commands.registerCommand(analyzeCommandId, handleAnalyzeCommand));

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
