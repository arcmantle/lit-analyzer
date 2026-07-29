import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, State, TransportKind } from 'vscode-languageclient/node';

import { filterExplicitLitPluginSettings } from './workspace-settings-filter.js';

const configurationSection = 'lit-plugin';

/** Lets tests observe the client's lifecycle without reaching into the module's internals. */
export interface LanguageServerHandle {
	getState(): State;
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
export function registerLanguageServer(context: vscode.ExtensionContext): LanguageServerHandle {
	const serverModule = context.asAbsolutePath(path.join('server', 'main.js'));

	const serverOptions: ServerOptions = {
		run:   { module: serverModule, transport: TransportKind.stdio },
		debug: { module: serverModule, transport: TransportKind.stdio },
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'typescript' },
			{ scheme: 'file', language: 'typescriptreact' },
			{ scheme: 'file', language: 'javascript' },
			{ scheme: 'file', language: 'javascriptreact' },
		],
		synchronize: {
			configurationSection,
		},
		middleware: {
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
		outputChannel: vscode.window.createOutputChannel('lit-language-server', { log: true }),
	};

	const client = new LanguageClient('lit-language-server', 'Lit Language Server', serverOptions, clientOptions);

	void client.start();
	context.subscriptions.push({ dispose: () => void client.stop() });

	return {
		getState: () => client.state,
	};
}
