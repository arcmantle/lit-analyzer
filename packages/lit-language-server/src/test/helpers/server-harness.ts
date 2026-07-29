import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createMessageConnection, type MessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import {
	type CodeAction,
	type CompletionItem,
	type Diagnostic,
	FileChangeType,
	type Hover,
	type LocationLink,
	type Position,
	type PrepareRenameResult,
	type Range,
	type SignatureHelp,
	type TextEdit,
	type WorkspaceEdit,
} from 'vscode-languageserver/node';

const compiledServerEntry = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'lib', 'main.js');

export interface ServerHarness {
	/**
	 * Opens `filePath` and resolves with whatever diagnostics the server
	 * publishes for it (an empty array for a clean file -- the server always
	 * publishes, even when there's nothing to report).
	 */
	openFile(filePath: string): Promise<Diagnostic[]>;
	/**
	 * Sends a `didChange` for a previously opened file, replacing its whole
	 * unsaved content -- the same edit an editor would send while the user
	 * types, but never written to disk.
	 */
	changeFile(filePath: string, text: string): Promise<void>;
	/**
	 * Waits for the *next* `publishDiagnostics` for an already-open file,
	 * without sending another `didOpen` -- for asserting that something the
	 * server watches (e.g. a config file) re-triggered analysis on its own.
	 */
	waitForNextDiagnostics(filePath: string): Promise<Diagnostic[]>;
	/** Sends `didClose` for a previously opened file. */
	closeFile(filePath: string): Promise<void>;
	/**
	 * Requests `textDocument/definition` for a previously opened file at
	 * `position`, resolving with whatever `LocationLink[]` the server returns
	 * (or `null` when there's no definition at that position).
	 */
	getDefinition(filePath: string, position: Position): Promise<LocationLink[] | null>;
	/**
	 * Requests `textDocument/hover` for a previously opened file at
	 * `position`, resolving with whatever `Hover` the server returns (or
	 * `null` when there's nothing to show at that position).
	 */
	getHover(filePath: string, position: Position): Promise<Hover | null>;
	/**
	 * Requests `textDocument/codeAction` for a previously opened file over
	 * `range`, resolving with whatever `CodeAction[]` the server returns (or
	 * `null` when there's nothing to fix there). Sent with an empty
	 * `context.diagnostics`, since these tests ask for a fix by range, not by
	 * reacting to a specific published diagnostic. `only` narrows the request
	 * to specific code action kinds, the same as a client's own menu would.
	 */
	getCodeActions(filePath: string, range: Range, only?: string[]): Promise<CodeAction[] | null>;
	/**
	 * Requests `textDocument/completion` for a previously opened file at
	 * `position`, resolving with whatever `CompletionItem[]` the server
	 * returns (or `null` when there's nothing to suggest at that position).
	 */
	getCompletions(filePath: string, position: Position): Promise<CompletionItem[] | null>;
	/**
	 * Requests `completionItem/resolve` for `item` (as previously returned by
	 * `getCompletions`), resolving with the server's filled-in `CompletionItem`.
	 */
	resolveCompletion(item: CompletionItem): Promise<CompletionItem>;
	/**
	 * Requests `textDocument/prepareRename` for a previously opened file at
	 * `position`, resolving with whatever `PrepareRenameResult` the server
	 * returns (or `null` when that position cannot be renamed).
	 */
	getPrepareRename(filePath: string, position: Position): Promise<PrepareRenameResult | null>;
	/**
	 * Requests `textDocument/rename` for a previously opened file at
	 * `position`, renaming to `newName`, resolving with whatever
	 * `WorkspaceEdit` the server returns (or `null` when nothing at that
	 * position can be renamed).
	 */
	getRename(filePath: string, position: Position, newName: string): Promise<WorkspaceEdit | null>;
	/**
	 * Requests `textDocument/signatureHelp` for a previously opened file at
	 * `position`, resolving with whatever `SignatureHelp` the server returns
	 * (or `null` when there's nothing to show at that position).
	 */
	getSignatureHelp(filePath: string, position: Position): Promise<SignatureHelp | null>;
	/**
	 * Requests `textDocument/onTypeFormatting` for a previously opened file,
	 * as if `ch` had just been typed at `position`, resolving with whatever
	 * `TextEdit[]` the server returns (or `null` when there's nothing to
	 * insert, e.g. outside a lit template).
	 */
	getOnTypeFormattingEdits(filePath: string, position: Position, ch: string): Promise<TextEdit[] | null>;
	/**
	 * Replaces the `lit-plugin` workspace settings the harness answers
	 * `workspace/configuration` requests with, then notifies the server via
	 * `workspace/didChangeConfiguration` -- simulating a user changing a
	 * setting in VS Code.
	 */
	setWorkspaceSettings(settings: Record<string, unknown>): Promise<void>;
	/**
	 * Writes a new file to disk at `filePath` and notifies the server as if
	 * the client's own file watcher had reported it created -- the server
	 * never sees this file through `didOpen`, only through the watcher
	 * notification, the same as a file created outside the editor (e.g. by a
	 * generator script or `git checkout`).
	 */
	createFile(filePath: string, text: string): Promise<void>;
	/**
	 * Deletes a file from disk at `filePath` and notifies the server as if
	 * the client's own file watcher had reported it deleted.
	 */
	deleteFile(filePath: string): Promise<void>;
	/**
	 * Renames a file on disk from `oldFilePath` to `newFilePath` and notifies
	 * the server with the same deleted-then-created pair a real file system
	 * watcher reports for a rename -- LSP has no dedicated "renamed" event.
	 */
	renameFile(oldFilePath: string, newFilePath: string): Promise<void>;
	/** Every message the server has sent via `window/logMessage`, in order. */
	readonly logMessages: string[];
	/** Stops the server process and its connection. */
	dispose(): void;
}

export interface StartServerOptions {
	/**
	 * The `lit-plugin` settings the harness answers `workspace/configuration`
	 * requests with from the start. Defaults to an empty object (no user
	 * overrides).
	 */
	workspaceSettings?: Record<string, unknown>;
}

/**
 * Spawns the real lit-language-server as its own process over stdio -- the
 * same transport production uses -- and completes the LSP handshake against
 * `rootDir`. This is the harness every later slice tests diagnostics
 * against: it runs the compiled server entry point, not an in-memory
 * stand-in, so packaging or runtime issues show up here instead of only in a
 * real extension host.
 *
 * Requires `pnpm run build` to have produced `lib/main.js` first (the
 * package's own `test` script does this).
 */
export async function startServer(rootDir: string, options: StartServerOptions = {}): Promise<ServerHarness> {
	let currentSettings: Record<string, unknown> = options.workspaceSettings ?? {};

	// The version a file was last opened or changed with, so `changeFile` can
	// send a monotonically increasing version the same way a real editor
	// does -- the server relies on that to know content actually changed.
	const versionByUri: Map<string, number> = new Map();

	const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [ compiledServerEntry, '--stdio' ], {
		stdio: [ 'pipe', 'pipe', 'pipe' ],
	});

	// Drained continuously so a chatty process can't fill the OS pipe buffer
	// and block, and kept around so any failure -- startup, timeout,
	// unexpected exit -- can report what the server actually said.
	let stderr = '';
	child.stderr.on('data', (chunk: Buffer) => {
		stderr += chunk.toString();
	});

	const connection: MessageConnection = createMessageConnection(
		new StreamMessageReader(child.stdout),
		new StreamMessageWriter(child.stdin),
	);

	// Every publish for a uri is kept (not just the latest), so a caller can
	// wait for the Nth publish specifically -- both the first one after
	// `didOpen`, and a later one triggered without any notification from the
	// client at all (e.g. a watched config file changing).
	const historyByUri: Map<string, Diagnostic[][]> = new Map();
	const waitersByUri: Map<string, { count: number; resolve: (diagnostics: Diagnostic[]) => void; }[]> = new Map();
	const rejectersByUri: Map<string, ((error: Error) => void)[]> = new Map();
	const logMessages: string[] = [];
	const logWaiters: { predicate: (message: string) => boolean; resolve: () => void; }[] = [];

	/**
	 * Resolves once a `window/logMessage` matching `predicate` has been seen,
	 * including one already received before this call -- so a caller can't
	 * miss a message that arrived just before it started waiting.
	 */
	function waitForLogMessage(predicate: (message: string) => boolean): Promise<void> {
		if (logMessages.some(predicate))
			return Promise.resolve();


		return new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				const index = logWaiters.findIndex(waiter => waiter.resolve === resolveWaiter);
				if (index !== -1)
					logWaiters.splice(index, 1);

				reject(new Error(describeFailure('Timed out waiting for a matching window/logMessage')));
			}, 10_000);

			const resolveWaiter = (): void => {
				clearTimeout(timer);
				resolve();
			};
			logWaiters.push({ predicate, resolve: resolveWaiter });
		});
	}

	function describeFailure(reason: string): string {
		return stderr.length === 0 ? reason : `${ reason }\n--- server stderr ---\n${ stderr }`;
	}

	function failAllPending(reason: string): void {
		const error = new Error(describeFailure(reason));
		for (const rejecters of rejectersByUri.values())
			rejecters.forEach(reject => reject(error));

		rejectersByUri.clear();
		waitersByUri.clear();
	}

	function waitForCount(uri: string, targetCount: number): Promise<Diagnostic[]> {
		const history = historyByUri.get(uri) ?? [];
		if (history.length >= targetCount)
			return Promise.resolve(history[targetCount - 1]);


		return new Promise<Diagnostic[]>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(describeFailure(`Timed out waiting for diagnostics (uri: ${ uri })`))),
				10_000,
			);

			const waiters = waitersByUri.get(uri) ?? [];
			waiters.push({
				count:   targetCount,
				resolve: diagnostics => {
					clearTimeout(timer);
					resolve(diagnostics);
				},
			});
			waitersByUri.set(uri, waiters);

			const rejecters = rejectersByUri.get(uri) ?? [];
			rejecters.push(error => {
				clearTimeout(timer);
				reject(error);
			});
			rejectersByUri.set(uri, rejecters);
		});
	}

	child.on('error', error => failAllPending(`lit-language-server process failed: ${ error.message }`));
	child.on('exit', (code, signal) =>
		failAllPending(`lit-language-server process exited unexpectedly (code ${ code }, signal ${ signal })`));

	connection.onNotification('window/logMessage', (params: { message: string; }) => {
		logMessages.push(params.message);
		for (let i = logWaiters.length - 1; i >= 0; i--) {
			if (logWaiters[i].predicate(params.message)) {
				logWaiters[i].resolve();
				logWaiters.splice(i, 1);
			}
		}
	});

	// Answers the server's `workspace/configuration` requests the same way a
	// real VS Code client would: with the current value of the `lit-plugin`
	// settings section, whatever that is right now.
	connection.onRequest('workspace/configuration', (params: { items: { section?: string | null; }[]; }) => {
		return params.items.map(item => (item.section === 'lit-plugin' ? currentSettings : null));
	});

	// Answers the server's dynamic capability registration (e.g. for a file
	// watcher) the same way a real client's LSP library does: an empty
	// success response, since this fake client doesn't act on what was
	// registered -- `createFile`/`deleteFile`/`renameFile` below send the
	// resulting `workspace/didChangeWatchedFiles` notifications directly
	// instead of watching the filesystem for real.
	connection.onRequest('client/registerCapability', () => null);

	connection.onNotification('textDocument/publishDiagnostics', (params: { uri: string; diagnostics: Diagnostic[]; }) => {
		const history = historyByUri.get(params.uri) ?? [];
		history.push(params.diagnostics);
		historyByUri.set(params.uri, history);

		const waiters = waitersByUri.get(params.uri) ?? [];
		const stillWaiting = waiters.filter(waiter => {
			if (history.length < waiter.count)
				return true;

			waiter.resolve(history[waiter.count - 1]);

			return false;
		});
		waitersByUri.set(params.uri, stillWaiting);
	});

	connection.listen();

	function dispose(): void {
		connection.dispose();
		child.kill();
	}

	try {
		await connection.sendRequest('initialize', {
			processId:    process.pid,
			rootUri:      pathToFileURL(rootDir).toString(),
			capabilities: { workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true } } },
		});
		await connection.sendNotification('initialized', {});
		// Waits for the server's first configuration pull so the settings
		// passed to `startServer` are already in effect before the caller
		// opens a file -- otherwise the first analysis could race the fetch.
		await waitForLogMessage(message => message.includes('refreshed workspace configuration'));
	}
	catch (error) {
		dispose();
		throw new Error(describeFailure(`lit-language-server failed to initialize: ${ (error as Error).message }`));
	}

	return {
		async openFile(filePath: string): Promise<Diagnostic[]> {
			const uri = pathToFileURL(filePath).toString();
			const targetCount = (historyByUri.get(uri)?.length ?? 0) + 1;
			const diagnostics = waitForCount(uri, targetCount);

			try {
				versionByUri.set(uri, 1);
				await connection.sendNotification('textDocument/didOpen', {
					textDocument: {
						uri,
						languageId: 'typescript',
						version:    1,
						text:       await fs.readFile(filePath, 'utf8'),
					},
				});
			}
			catch (error) {
				const rejecters = rejectersByUri.get(uri);
				rejectersByUri.delete(uri);
				waitersByUri.delete(uri);
				const failure = new Error(describeFailure(`Could not open ${ filePath }: ${ (error as Error).message }`));
				rejecters?.forEach(reject => reject(failure));
				throw failure;
			}

			return diagnostics;
		},

		async changeFile(filePath: string, text: string): Promise<void> {
			const uri = pathToFileURL(filePath).toString();
			const version = (versionByUri.get(uri) ?? 1) + 1;
			versionByUri.set(uri, version);

			await connection.sendNotification('textDocument/didChange', {
				textDocument:   { uri, version },
				contentChanges: [ { text } ],
			});
		},

		waitForNextDiagnostics(filePath: string): Promise<Diagnostic[]> {
			const uri = pathToFileURL(filePath).toString();
			const targetCount = (historyByUri.get(uri)?.length ?? 0) + 1;

			return waitForCount(uri, targetCount);
		},

		async closeFile(filePath: string): Promise<void> {
			const uri = pathToFileURL(filePath).toString();
			await connection.sendNotification('textDocument/didClose', {
				textDocument: { uri },
			});
		},

		async getDefinition(filePath: string, position: Position): Promise<LocationLink[] | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/definition', {
				textDocument: { uri },
				position,
			});
		},

		async getHover(filePath: string, position: Position): Promise<Hover | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/hover', {
				textDocument: { uri },
				position,
			});
		},

		async getCodeActions(filePath: string, range: Range, only?: string[]): Promise<CodeAction[] | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/codeAction', {
				textDocument: { uri },
				range,
				context:      { diagnostics: [], only },
			});
		},

		async getCompletions(filePath: string, position: Position): Promise<CompletionItem[] | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/completion', {
				textDocument: { uri },
				position,
			});
		},

		async resolveCompletion(item: CompletionItem): Promise<CompletionItem> {
			return connection.sendRequest('completionItem/resolve', item);
		},

		async getPrepareRename(filePath: string, position: Position): Promise<PrepareRenameResult | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/prepareRename', {
				textDocument: { uri },
				position,
			});
		},

		async getRename(filePath: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/rename', {
				textDocument: { uri },
				position,
				newName,
			});
		},

		async getSignatureHelp(filePath: string, position: Position): Promise<SignatureHelp | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/signatureHelp', {
				textDocument: { uri },
				position,
			});
		},

		async getOnTypeFormattingEdits(filePath: string, position: Position, ch: string): Promise<TextEdit[] | null> {
			const uri = pathToFileURL(filePath).toString();

			return connection.sendRequest('textDocument/onTypeFormatting', {
				textDocument: { uri },
				position,
				ch,
				options:      { tabSize: 4, insertSpaces: true },
			});
		},

		async setWorkspaceSettings(settings: Record<string, unknown>): Promise<void> {
			currentSettings = settings;
			await connection.sendNotification('workspace/didChangeConfiguration', { settings: null });
		},

		async createFile(filePath: string, text: string): Promise<void> {
			await fs.writeFile(filePath, text, 'utf8');
			await connection.sendNotification('workspace/didChangeWatchedFiles', {
				changes: [ { uri: pathToFileURL(filePath).toString(), type: FileChangeType.Created } ],
			});
		},

		async deleteFile(filePath: string): Promise<void> {
			await fs.rm(filePath);
			await connection.sendNotification('workspace/didChangeWatchedFiles', {
				changes: [ { uri: pathToFileURL(filePath).toString(), type: FileChangeType.Deleted } ],
			});
		},

		async renameFile(oldFilePath: string, newFilePath: string): Promise<void> {
			await fs.rename(oldFilePath, newFilePath);
			await connection.sendNotification('workspace/didChangeWatchedFiles', {
				changes: [
					{ uri: pathToFileURL(oldFilePath).toString(), type: FileChangeType.Deleted },
					{ uri: pathToFileURL(newFilePath).toString(), type: FileChangeType.Created },
				],
			});
		},

		logMessages,

		dispose,
	};
}
