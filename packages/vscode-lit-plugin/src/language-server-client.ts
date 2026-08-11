import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, State, TransportKind } from 'vscode-languageclient/node';

import { TYPESCRIPT_SDK_ENVIRONMENT_VARIABLE } from './typescript-sdk.js';
import { VisibleDocumentSynchronization } from './visible-document-synchronization.js';
import { filterExplicitLitPluginSettings } from './workspace-settings-filter.js';

const configurationSection = 'lit-plugin';

/** Lets tests observe the client's lifecycle without reaching into the module's internals. */
export interface LanguageServerHandle {
	getState(): State;
	restart(): Promise<void>;
	format(document: vscode.TextDocument, options: FormattingOptions): Promise<vscode.TextEdit[]>;
}

export interface FormattingOptions {
	tabSize:      number;
	insertSpaces: boolean;
}

interface LanguageServerTextEdit {
	range: {
		start: { line: number; character: number; };
		end:   { line: number; character: number; };
	};
	newText: string;
}

/**
 * Wires the standalone lit-language-server as the extension's only source of
 * lit diagnostics, completions and hovers. The server starts on activation
 * and stops when the extension deactivates.
 *
 * `synchronize.configurationSection` makes the client send
 * `workspace/didChangeConfiguration` whenever a `lit-plugin.*` setting
 * changes, so the server can re-pull it via `workspace/configuration` and
 * re-run diagnostics without a reload.
 *
 * The `workspace/configuration` request itself is answered by a
 * `middleware.workspace.configuration` hook rather than
 * `vscode-languageclient`'s own default handling: VS Code always reports a
 * value for every `lit-plugin.*` setting, even ones the user never touched,
 * falling back to the setting's own schema default. The server must only
 * see the settings the user actually chose, or it would silently override
 * `lit-analyzer.config.json` for every untouched field. `workspace-settings-
 * filter.ts` does that filtering, the same way the old `api.configurePlugin`
 * path did with `WorkspaceConfiguration.inspect`.
 */
export function registerLanguageServer(context: vscode.ExtensionContext, typescriptSdkDirectory?: string): LanguageServerHandle {
	const serverModule = context.asAbsolutePath(path.join('server', 'bootstrap.js'));
	const options = typescriptSdkDirectory == null
		? undefined
		: { env: { ...process.env, [TYPESCRIPT_SDK_ENVIRONMENT_VARIABLE]: typescriptSdkDirectory } };

	const serverOptions: ServerOptions = {
		run:   { module: serverModule, transport: TransportKind.stdio, options },
		debug: { module: serverModule, transport: TransportKind.stdio, options },
	};
	const outputChannel = vscode.window.createOutputChannel('lit-language-server', { log: true });
	const visibleDocumentSynchronization: VisibleDocumentSynchronization<vscode.TextDocument>
		= new VisibleDocumentSynchronization(
			document => vscode.window.visibleTextEditors
				.some(editor => editor.document.uri.toString() === document.uri.toString()),
		);

	context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
		for (const editor of editors) {
			void visibleDocumentSynchronization.didBecomeVisible(editor.document).catch(error => {
				outputChannel.error(`Failed to synchronize visible document ${ editor.document.uri.toString() }: ${ String(error) }`);
			});
		}
	}));

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'typescript' },
			{ scheme: 'file', language: 'typescriptreact' },
			{ scheme: 'file', language: 'javascript' },
			{ scheme: 'file', language: 'javascriptreact' },
		],
		textSynchronization: {
			delayOpenNotifications: true,
		},
		synchronize: {
			configurationSection,
		},
		middleware: {
			didOpen:   (document, next) => visibleDocumentSynchronization.didOpen(document, next),
			didChange: (event, next) => visibleDocumentSynchronization.didChange(event.document, () => next(event)),
			didClose:  (document, next) => visibleDocumentSynchronization.didClose(document, next),
			workspace: {
				configuration: (params, token, next) => {
					if (!params.items.every(item => item.section === configurationSection))
						return next(params, token);


					return params.items.map(item => {
						const scopeUri = item.scopeUri == null ? undefined : vscode.Uri.parse(item.scopeUri);

						return filterExplicitLitPluginSettings(vscode.workspace.getConfiguration(configurationSection, scopeUri));
					});
				},
			},
		},
		outputChannel,
	};

	const client = new LanguageClient('lit-language-server', 'Lit Language Server', serverOptions, clientOptions);
	const initialStart = client.start();
	let restartPromise: Promise<void> | undefined;

	context.subscriptions.push({ dispose: () => void client.stop() });

	return {
		getState: () => client.state,
		format:   async (document, options) => {
			const edits = await client.sendRequest<LanguageServerTextEdit[] | null>('textDocument/formatting', {
				textDocument: { uri: document.uri.toString() },
				options,
			});

			return (edits ?? []).map(edit => new vscode.TextEdit(
				new vscode.Range(edit.range.start.line, edit.range.start.character, edit.range.end.line, edit.range.end.character),
				edit.newText,
			));
		},
		restart: () => {
			restartPromise ??= initialStart
				.then(() => client.restart())
				.finally(() => restartPromise = undefined);

			return restartPromise;
		},
	};
}
