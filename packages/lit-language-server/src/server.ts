import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LitAnalyzerConfig } from 'lit-analyzer';
import type * as ts from 'typescript';
import type { CodeAction, CodeActionParams, CompletionItem, CompletionParams, Connection, DefinitionParams, DocumentOnTypeFormattingParams, Hover, HoverParams, InitializeParams, InitializeResult, LocationLink, PrepareRenameParams, PrepareRenameResult, RenameParams, SignatureHelp, SignatureHelpParams, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';
import { CodeActionKind, DidChangeWatchedFilesNotification, FileChangeType, TextDocumentSyncKind } from 'vscode-languageserver/node';

import { resolveConfigForFile } from './config-file.js';
import { type CancellationToken, createDebouncedRunner } from './debounced-runner.js';
import { translateLitDiagnostics } from './lit-diagnostics.js';
import { createProjectRegistry } from './project-registry.js';
import { translateCodeFixes } from './translate-code-fixes.js';
import { translateCompletionDetails } from './translate-completion-details.js';
import { type LitCompletionItemData, translateCompletions } from './translate-completions.js';
import { translateDefinition } from './translate-definition.js';
import { translateQuickInfo } from './translate-quick-info.js';
import { translateRenameInfo } from './translate-rename-info.js';
import { translateRenameLocations } from './translate-rename-locations.js';
import { translateSignatureHelp } from './translate-signature-help.js';
import { findNearestTsconfig } from './tsconfig-file.js';
import { mergeConfig, parseWorkspaceSettings } from './workspace-settings.js';

/** The `workspace/configuration` section VS Code settings live under. */
const CONFIGURATION_SECTION = 'lit-plugin';

/**
 * How long a burst of `didChange` notifications must go quiet before
 * diagnostics are recomputed -- long enough to collapse a fast typist's
 * keystrokes into a single run, short enough that the delay isn't felt.
 */
const DEBOUNCE_DELAY_MS = 300;

/** Used for analysis runs that aren't part of a debounced, cancellable batch. */
const NEVER_CANCELLED: CancellationToken = { isCancellationRequested: () => false };

/** Lets the event loop process any pending message (e.g. a newer `didChange`) before continuing a loop. */
function yieldToEventLoop(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

/**
 * Confirms a completion item's `data` (round-tripped by the client between
 * `onCompletion` and `onCompletionResolve`) still has the shape this server
 * put on it -- a client is free to send back anything, so this is checked
 * rather than assumed before it's used to look up a file and re-run analysis.
 */
function isLitCompletionItemData(data: unknown): data is LitCompletionItemData {
	if (data == null || typeof data !== 'object')
		return false;

	const candidate = data as Partial<LitCompletionItemData>;

	return typeof candidate.fileName === 'string' && typeof candidate.position === 'number' && typeof candidate.name === 'string';
}

/**
 * Maps the client's `SignatureHelpContext` onto the `ts.SignatureHelpTriggerReason`
 * the language service expects -- forwarded as-is, the same way `ts-lit-plugin`
 * forwards tsserver's own reason, so a retrigger (e.g. typing `,` to move to
 * the next parameter, or moving the cursor) keeps the active signature
 * stable instead of resetting it. `undefined` (no context sent) is treated
 * the same as a manual invocation.
 */
function toSignatureHelpTriggerReason(context: SignatureHelpParams['context']): ts.SignatureHelpTriggerReason {
	if (context == null)
		return { kind: 'invoked' };


	if (context.isRetrigger) {
		return {
			kind:             'retrigger',
			triggerCharacter: context.triggerCharacter as ts.SignatureHelpRetriggerCharacter,
		};
	}

	if (context.triggerCharacter != null) {
		return {
			kind:             'characterTyped',
			triggerCharacter: context.triggerCharacter as ts.SignatureHelpTriggerCharacter,
		};
	}

	return { kind: 'invoked' };
}

/**
 * The client's root, if it gave us one. `rootUri` is a `file://` URI;
 * `rootPath` is deprecated but still sent by some clients instead.
 */
function getRootPath(params: InitializeParams): string | undefined {
	if (params.rootUri)
		return fileURLToPath(params.rootUri);

	return params.rootPath ?? undefined;
}

/**
 * Wires the LSP handshake onto an already-created connection and starts
 * listening. Takes a `Connection` rather than creating one so the transport
 * (stdio in production, an in-memory pipe in tests) is the caller's concern.
 *
 * If the client gave us a root, walks up from it to find the nearest
 * `tsconfig.json` and boots the analysis compiler against it -- logging how
 * many source files it resolved. `extends`, `include`, `exclude` and `files`
 * are all honoured, since parsing goes through `ts.parseJsonConfigFileContent`.
 * That tsconfig is watched, and editing it rebuilds the analysis compiler and
 * re-runs diagnostics for every open document, the same as editing
 * `lit-analyzer.config.json` does below. Publishes lit diagnostics when a
 * document opens, changes or closes. An opened or changed document's unsaved
 * content is tracked by the analysis compiler and takes priority over disk;
 * closing a document without saving reverts it to disk content and
 * republishes diagnostics against that disk content, so no stale diagnostic
 * from the discarded edit is left behind.
 *
 * A workspace with more than one TypeScript project is supported: every
 * open document is routed to its own project -- the nearest `tsconfig.json`
 * walking up from that document, not necessarily the one the client's root
 * resolved to -- via `ProjectRegistry`. Each project gets its own analysis
 * compiler and `LitAnalyzer`, so two projects' `Program`s and compiler
 * options never bleed into each other. A project is booted the first time a
 * document under it is opened, and released once no open document resolves
 * to it any more (see `onDidCloseTextDocument` below).
 *
 * Opening a file with no `tsconfig.json` anywhere above it (a loose file,
 * e.g. outside any project) still gets diagnostics: `ProjectRegistry` falls
 * back to an inferred project holding just that one file and whatever it
 * resolvably imports, mirroring what tsserver calls an inferred project.
 * This is deliberately quieter than a real project -- no `include`/
 * `exclude`, no project-wide strictness from a tsconfig that doesn't exist
 * -- so diagnostics for a loose file may differ from what a real tsconfig
 * for it would have produced.
 *
 * A change to one open document re-runs every open document, not just the
 * one that changed. A changed file can be a component definition another
 * open document already uses -- renaming its tag, or adding or removing a
 * property, must update that other document's diagnostics right away,
 * without saving or reopening it.
 *
 * Rule configuration comes from the nearest `lit-analyzer.config.json`
 * walking up from the open file, resolved fresh for every analysis. The
 * config file found for an open document is watched, so editing it re-runs
 * diagnostics for every currently open document without needing a reload.
 *
 * VS Code settings under the `lit-plugin` section are pulled via
 * `workspace/configuration` once the handshake completes, and re-pulled on
 * every `workspace/didChangeConfiguration` notification -- so changing a
 * setting re-runs diagnostics without a reload, same as editing the config
 * file. Those settings override the config file, but the rule map is merged
 * rather than replaced wholesale: a rule the settings don't mention keeps
 * whatever the config file said about it.
 *
 * If the tsconfig still has the old `ts-lit-plugin` plugin entry in
 * `compilerOptions.plugins`, that entry is never read -- only reported, once
 * per session at boot, so no one loses configuration silently.
 *
 * A client with no `tsconfig.json` anywhere at or above its root is expected
 * to happen (e.g. an empty workspace), so a missing tsconfig or a boot
 * failure is logged and otherwise ignored rather than failing the handshake:
 * the acceptance for this slice is "boots and reports a count when it can",
 * not "every client must have a tsconfig".
 */
export function createServer(connection: Connection): Connection {
	let supportsWorkspaceConfiguration = false;
	// Whether the client can dynamically register a file watcher for us --
	// without this, created/deleted/renamed component files are never
	// noticed until some other trigger (e.g. editing the tsconfig) happens
	// to rebuild the project they belong to.
	let supportsFileWatcherRegistration = false;
	let workspaceSettings: Partial<LitAnalyzerConfig> = {};
	// Bumped on every refresh, so a slower, older request can't overwrite a
	// newer one that already resolved (e.g. two settings changes in a row).
	let workspaceSettingsRequestId = 0;
	// The token for whichever `analyzeAndPublish` call is currently running --
	// read by `createLitAnalyzer`'s handler so the analyzer core sees the real
	// cancellation state of the run in progress, not just its wall-clock timeout.
	let currentCancellationToken: CancellationToken = NEVER_CANCELLED;

	// uri -> file path, so a config change can re-analyze what's open.
	const openDocuments: Map<string, string> = new Map();
	// config file path -> its watcher, so the same file isn't watched twice.
	const configWatchers: Map<string, fs.FSWatcher> = new Map();
	// One analysis compiler and `LitAnalyzer` per tsconfig.json discovered so
	// far, so a workspace with more than one TypeScript project gets correct,
	// isolated results in every one.
	//
	// Refers to `debouncedReanalyze` before it's declared further down --
	// safe, since `onTsconfigChanged` is only ever called from an `fs.watch`
	// event, always well after `debouncedReanalyze` has been assigned.
	const registry = createProjectRegistry({
		log:                  message => connection.console.log(message),
		logError:             message => connection.console.error(message),
		getCancellationToken: () => currentCancellationToken,
		onTsconfigChanged:    tsconfigPath => {
			connection.console.log(`lit-language-server detected a change to ${ tsconfigPath }, rebuilding the project`);
			registry.rebuildProject(tsconfigPath);
			debouncedReanalyze.schedule();
		},
	});

	/**
	 * Pulls the `lit-plugin` VS Code settings via `workspace/configuration`
	 * and caches the parsed result for the next `analyzeAndPublish` call. A
	 * no-op when the client never declared `workspace.configuration` support.
	 */
	async function refreshWorkspaceSettings(): Promise<void> {
		if (!supportsWorkspaceConfiguration)
			return;


		const requestId = ++workspaceSettingsRequestId;
		try {
			const raw = await connection.workspace.getConfiguration(CONFIGURATION_SECTION);
			if (requestId !== workspaceSettingsRequestId) {
				// A later refresh already started (and may have already
				// finished) while this one was in flight -- its result is
				// stale, so it must not overwrite whatever that one found.
				return;
			}

			workspaceSettings = parseWorkspaceSettings(raw);
			connection.console.log('lit-language-server refreshed workspace configuration');
		}
		catch (error) {
			connection.console.error(`lit-language-server could not read workspace configuration: ${ (error as Error).message }`);
		}
	}

	function reanalyzeOpenDocuments(token: CancellationToken = NEVER_CANCELLED): Promise<void> {
		return (async () => {
			// Snapshotted so this run's scope is exactly the documents that were
			// open when it started, regardless of documents opened or closed
			// while it's yielding between documents below.
			const documentsToAnalyze = Array.from(openDocuments.entries());

			let isFirst = true;
			for (const [ openUri, openFileName ] of documentsToAnalyze) {
				if (token.isCancellationRequested())
					return;


				// Yields to the event loop between documents (not before the
				// first) so a `didChange` that arrives while this batch is still
				// running gets a chance to cancel `token` before the loop reaches
				// the remaining documents, instead of grinding through all of
				// them regardless.
				if (!isFirst) {
					await yieldToEventLoop();
					if (token.isCancellationRequested())
						return;
				}

				isFirst = false;

				analyzeAndPublish(openUri, openFileName, token);
			}
		})();
	}

	// Debounces every trigger that re-analyzes *every* open document (typing,
	// closing a document, a config file changing, a tsconfig changing,
	// workspace settings changing) into a single shared runner -- so at most
	// one such run is ever in flight, and a newer trigger always cancels the
	// previous run rather than the two racing to publish for the same
	// documents out of order.
	const debouncedReanalyze = createDebouncedRunner(DEBOUNCE_DELAY_MS, token => reanalyzeOpenDocuments(token));

	function analyzeAndPublish(uri: string, fileName: string, token: CancellationToken = NEVER_CANCELLED): void {
		const project = registry.getOrCreateProject(fileName);
		if (project == null)
			return;


		// Wraps the whole analysis, not just the diagnostics call, so a
		// failure for one document (e.g. the language service cannot build a
		// `Program`) cannot stop `reanalyzeOpenDocuments` from reaching the
		// other open documents in its loop.
		try {
			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return;


			const resolvedConfig = resolveConfigForFile(fileName);
			if (resolvedConfig.error) {
				connection.console.error(
					`lit-language-server could not parse ${ resolvedConfig.configPath }: ${ resolvedConfig.error }`,
				);
			}

			const mergedConfig = mergeConfig(resolvedConfig.config, workspaceSettings);
			project.litAnalyzerHandle.setConfig(mergedConfig);
			watchConfigFile(resolvedConfig.configPath);

			// Read by the `getCancellationToken` handler passed to `createLitAnalyzer`,
			// so the analyzer core's own cancellation checks see this run's real token.
			currentCancellationToken = token;
			const diagnostics = translateLitDiagnostics(
				project.litAnalyzerHandle.analyzer.getDiagnosticsInFile(sourceFile),
				sourceFile,
				mergedConfig.dontShowSuggestions,
			);
			connection.sendDiagnostics({ uri, diagnostics }).catch(error => {
				connection.console.error(
					`lit-language-server could not publish diagnostics for ${ fileName }: ${ (error as Error).message }`,
				);
			});
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute diagnostics for ${ fileName }: ${ (error as Error).message }`,
			);
		}
		finally {
			currentCancellationToken = NEVER_CANCELLED;
		}
	}

	function watchConfigFile(configPath: string | undefined): void {
		if (configPath == null || configWatchers.has(configPath))
			return;


		try {
			const watcher = fs.watch(configPath, () => {
				connection.console.log(
					`lit-language-server detected a change to ${ configPath }, re-running diagnostics for open documents`,
				);
				debouncedReanalyze.schedule();
			});
			configWatchers.set(configPath, watcher);
		}
		catch (error) {
			connection.console.error(`lit-language-server could not watch ${ configPath }: ${ (error as Error).message }`);
		}
	}

	/**
	 * Stops watching any config file no open document resolves to any more.
	 * Called after a document closes, since that's the only event that can
	 * make a previously-referenced config file unreferenced.
	 */
	function stopWatchingUnreferencedConfigFiles(): void {
		const stillReferenced: Set<string> = new Set();
		for (const openFileName of openDocuments.values()) {
			const { configPath } = resolveConfigForFile(openFileName);
			if (configPath != null)
				stillReferenced.add(configPath);
		}

		for (const [ configPath, watcher ] of configWatchers) {
			if (!stillReferenced.has(configPath)) {
				watcher.close();
				configWatchers.delete(configPath);
				connection.console.log(`lit-language-server stopped watching ${ configPath } (no open document uses it)`);
			}
		}
	}

	connection.onInitialize((params: InitializeParams): InitializeResult => {
		connection.console.log('lit-language-server started and completed the LSP handshake');

		supportsWorkspaceConfiguration = params.capabilities.workspace?.configuration === true;
		supportsFileWatcherRegistration = params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;

		const rootPath = getRootPath(params);
		if (rootPath) {
			const tsconfigPath = findNearestTsconfig(rootPath);
			if (tsconfigPath == null)
				connection.console.error(`lit-language-server could not find a tsconfig.json at or above ${ rootPath }`);
			else
				registry.ensureProject(tsconfigPath);
		}

		return {
			capabilities: {
				// Full sync: each didChange sends the whole document text, which
				// the analysis compiler tracks as that document's new content.
				textDocumentSync:                 { openClose: true, change: TextDocumentSyncKind.Full },
				definitionProvider:               true,
				hoverProvider:                    true,
				// Only ever returns quick fixes, so a client asking for a different
				// kind (e.g. a "source" action) knows in advance not to bother.
				codeActionProvider:               { codeActionKinds: [ CodeActionKind.QuickFix ] },
				// `prepareProvider` lets the client confirm a position can be
				// renamed (and show the exact span) before it ever sends
				// `textDocument/rename`.
				renameProvider:                   { prepareProvider: true },
				// `resolveProvider` lets the client ask for a completion item's
				// documentation lazily, only once the user highlights it, instead
				// of computing it for every item up front.
				completionProvider:               { resolveProvider: true },
				signatureHelpProvider:            { triggerCharacters: [ '(', ',' ] },
				// Auto-closes a tag once its `>` is typed. There's no dedicated
				// LSP feature for this (unlike tsserver's own
				// `getJsxClosingTagAtPosition`, which VS Code's built-in
				// TypeScript support wires up on its own) -- `onTypeFormatting`
				// is the closest LSP equivalent a client already knows how to
				// call without any extension-side wiring of its own.
				documentOnTypeFormattingProvider: { firstTriggerCharacter: '>' },
			},
		};
	});

	connection.onDidOpenTextDocument(params => {
		const fileName = fileURLToPath(params.textDocument.uri);
		openDocuments.set(params.textDocument.uri, fileName);
		registry.getOrCreateProject(fileName)?.compiler.openDocument(fileName, params.textDocument.text);
		analyzeAndPublish(params.textDocument.uri, fileName);
	});

	// Go-to-definition from a tag name, attribute, property or event in a
	// template to its declaration -- backed by the same `LitAnalyzer` used for
	// diagnostics, ported from `ts-lit-plugin`'s `getDefinitionAndBoundSpan`.
	// Wrapped in try/catch the same way `analyzeAndPublish` is: a bad position
	// (e.g. a stale one from a client racing a fast edit) or a failure inside
	// the analyzer must not crash the connection, just this one request.
	connection.onDefinition((params: DefinitionParams): LocationLink[] | null => {
		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const definition = project.litAnalyzerHandle.analyzer.getDefinitionAtPosition(sourceFile, position);
			if (definition == null)
				return null;


			return translateDefinition(definition, sourceFile);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute a definition for ${ params.textDocument.uri }: ${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Hover on a tag name, attribute, property or event in a template --
	// backed by the same `LitAnalyzer` used for diagnostics, ported from
	// `ts-lit-plugin`'s `getQuickInfoAtPosition`. Unlike the plugin, there's
	// no underlying tsserver quick info to fall back to when the analyzer has
	// nothing for this position -- this server only ever serves lit
	// template hovers, never general TypeScript ones. Wrapped in try/catch
	// the same way `onDefinition` is: a bad position or a failure inside the
	// analyzer must not crash the connection, just this one request.
	connection.onHover((params: HoverParams): Hover | null => {
		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const quickInfo = project.litAnalyzerHandle.analyzer.getQuickInfoAtPosition(sourceFile, position);
			if (quickInfo == null)
				return null;


			return translateQuickInfo(quickInfo, sourceFile);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute a hover for ${ params.textDocument.uri }: ${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Quick fixes for the rules that provide them (e.g. adding a missing
	// import, renaming a misspelled tag) -- backed by the same `LitAnalyzer`
	// used for diagnostics, ported from `ts-lit-plugin`'s `getCodeFixesAtPosition`.
	// Wrapped in try/catch the same way `onDefinition` is: a bad range or a
	// failure inside the analyzer must not crash the connection, just this
	// one request.
	connection.onCodeAction((params: CodeActionParams): CodeAction[] | null => {
		// This server only ever returns quick fixes -- if the client narrowed
		// its request to kinds that can't include one, there's nothing to do.
		const only = params.context.only;
		if (
			only != null
			&& !only.some(kind => kind === CodeActionKind.QuickFix || CodeActionKind.QuickFix.startsWith(`${ kind }.`))
		)
			return null;


		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const start = sourceFile.getPositionOfLineAndCharacter(params.range.start.line, params.range.start.character);
			const end = sourceFile.getPositionOfLineAndCharacter(params.range.end.line, params.range.end.character);
			const codeFixes = project.litAnalyzerHandle.analyzer.getCodeFixesAtPositionRange(sourceFile, { start, end });

			return translateCodeFixes(codeFixes, sourceFile);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute a code action for ${ params.textDocument.uri }: ${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Confirms a position can be renamed and marks its span, before the client
	// ever sends `textDocument/rename` -- backed by the same `LitAnalyzer` used
	// for diagnostics, ported from `ts-lit-plugin`'s `getRenameInfo`. Wrapped in
	// try/catch the same way `onDefinition` is: a bad position or a failure
	// inside the analyzer must not crash the connection, just this one request.
	connection.onPrepareRename((params: PrepareRenameParams): PrepareRenameResult | null => {
		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const renameInfo = project.litAnalyzerHandle.analyzer.getRenameInfoAtPosition(sourceFile, position);
			if (renameInfo == null)
				return null;


			return translateRenameInfo(renameInfo, sourceFile);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not prepare a rename for ${ params.textDocument.uri }: ${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Renames a custom element tag across its definition and every template
	// usage -- backed by the same `LitAnalyzer` used for diagnostics, ported
	// from `ts-lit-plugin`'s `findRenameLocations`. Locations can span several
	// files, so all edits are returned together in one `WorkspaceEdit`, which a
	// conforming client applies atomically. Wrapped in try/catch the same way
	// `onDefinition` is: a bad position or a failure inside the analyzer must
	// not crash the connection, just this one request.
	connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const program = project.compiler.getProgram();
			const sourceFile = program.getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const renameLocations = project.litAnalyzerHandle.analyzer.getRenameLocationsAtPosition(sourceFile, position);
			if (renameLocations.length === 0)
				return null;


			return translateRenameLocations(renameLocations, params.newName, program);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute a rename for ${ params.textDocument.uri }: ${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Tag name, attribute, property, event, slot, CSS part and CSS custom
	// property completions inside `html` and `css` templates -- backed by the
	// same `LitAnalyzer` used for diagnostics, ported from `ts-lit-plugin`'s
	// `getCompletionsAtPosition`. Per ADR, TypeScript's own completions are no
	// longer suppressed: this server only ever adds lit completions alongside
	// whatever the editor's own TypeScript completions already offer, never
	// replacing them. Each returned item carries `data` (see
	// `translate-completions.ts`) so a later `completionItem/resolve` request
	// can find its documentation without repeating the file/position lookup.
	// Wrapped in try/catch the same way `onDefinition` is: a bad position or a
	// failure inside the analyzer must not crash the connection, just this
	// one request.
	connection.onCompletion((params: CompletionParams): CompletionItem[] | null => {
		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const completions = project.litAnalyzerHandle.analyzer.getCompletionsAtPosition(sourceFile, position);
			if (completions == null || completions.length === 0)
				return null;


			return translateCompletions(completions, sourceFile, fileName, position);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute completions for ${ params.textDocument.uri }: ${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Fills in a completion item's documentation, once the client asks for it
	// -- backed by the same `LitAnalyzer` used for diagnostics, ported from
	// `ts-lit-plugin`'s `getCompletionEntryDetails`. Relies on the analyzer's
	// own completion cache, populated by the `onCompletion` call that produced
	// this item, the same way the tsserver plugin does -- that cache is one
	// per *project* (shared by every open file in it, the same as the
	// tsserver plugin's own cache is one per plugin instance), not one per
	// file, so this must be called for an item from the most recent
	// completion list for its project, not an arbitrary older one, or an item
	// from a different project entirely. Wrapped in try/catch the same way
	// `onDefinition` is: a bad position or a failure inside the analyzer must
	// not crash the connection, just leave the item's documentation unfilled.
	connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
		const data = isLitCompletionItemData(item.data) ? item.data : undefined;
		if (data == null)
			return item;


		try {
			const project = registry.getOrCreateProject(data.fileName);
			if (project == null)
				return item;


			const sourceFile = project.compiler.getProgram().getSourceFile(data.fileName);
			if (sourceFile == null)
				return item;


			const details = project.litAnalyzerHandle.analyzer.getCompletionDetailsAtPosition(sourceFile, data.position, data.name);
			if (details == null)
				return item;


			return translateCompletionDetails(item, details);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not resolve completion details for ${ data.fileName }: ${ (error as Error).message }`,
			);

			return item;
		}
	});

	// Signature help for a call, construct, or tagged template expression --
	// backed directly by the project's own `ts.LanguageService`, not the
	// analyzer core: a directive call (e.g. `classMap(...)`) inside a
	// template is an ordinary TypeScript call, ported from `ts-lit-plugin`'s
	// `getSignatureHelpItems`. Unlike every other handler above, this one
	// doesn't need `LitAnalyzer` at all -- the only lit-specific behaviour is
	// `translateSignatureHelp` filtering out the `html`/`css` tag function's
	// own signature. Wrapped in try/catch the same way `onDefinition` is: a
	// bad position or a failure inside the language service must not crash
	// the connection, just this one request.
	connection.onSignatureHelp((params: SignatureHelpParams): SignatureHelp | null => {
		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const items = project.compiler.getSignatureHelpItems(fileName, position, toSignatureHelpTriggerReason(params.context));

			return translateSignatureHelp(items);
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute signature help for ${ params.textDocument.uri }: \
${ (error as Error).message }`,
			);

			return null;
		}
	});

	// Auto-closes a tag once `>` is typed inside a lit template -- backed by
	// the same `LitAnalyzer` used for diagnostics, ported from
	// `ts-lit-plugin`'s `getJsxClosingTagAtPosition`. Only ever fires inside
	// an `html` template: `getClosingTagAtPosition` returns `undefined`
	// anywhere else (e.g. plain TypeScript, or a `css` template), the same
	// as every other lit-specific handler above. Wrapped in try/catch the
	// same way `onDefinition` is: a bad position or a failure inside the
	// analyzer must not crash the connection, just this one request.
	connection.onDocumentOnTypeFormatting((params: DocumentOnTypeFormattingParams): TextEdit[] | null => {
		if (params.ch !== '>')
			return null;


		try {
			const fileName = fileURLToPath(params.textDocument.uri);
			const project = registry.getOrCreateProject(fileName);
			if (project == null)
				return null;


			const sourceFile = project.compiler.getProgram().getSourceFile(fileName);
			if (sourceFile == null)
				return null;


			const position = sourceFile.getPositionOfLineAndCharacter(params.position.line, params.position.character);
			const closingTag = project.litAnalyzerHandle.analyzer.getClosingTagAtPosition(sourceFile, position);
			if (closingTag == null)
				return null;


			return [
				{
					range:   { start: params.position, end: params.position },
					newText: closingTag.newText,
				},
			];
		}
		catch (error) {
			connection.console.error(
				`lit-language-server could not compute an auto-closing tag for ${ params.textDocument.uri }: \
${ (error as Error).message }`,
			);

			return null;
		}
	});

	connection.onDidChangeTextDocument(params => {
		const fileName = fileURLToPath(params.textDocument.uri);
		const [ latestChange ] = params.contentChanges.slice(-1);
		if (latestChange != null && 'text' in latestChange)
			registry.getOrCreateProject(fileName)?.compiler.updateDocument(fileName, latestChange.text);

		// Debounced: re-runs every open document once typing pauses, not on
		// every keystroke -- a changed file can be a component definition
		// another open document already uses, and that document's published
		// diagnostics must not go stale until it happens to change itself.
		debouncedReanalyze.schedule();
	});

	connection.onDidCloseTextDocument(params => {
		const fileName = openDocuments.get(params.textDocument.uri);
		openDocuments.delete(params.textDocument.uri);
		if (fileName != null) {
			registry.getOrCreateProject(fileName)?.compiler.closeDocument(fileName);
			// Republishes so a closed, unsaved edit doesn't leave a stale
			// diagnostic behind -- the compiler now reports disk content again.
			analyzeAndPublish(params.textDocument.uri, fileName);
			// Reverting to disk content is itself a content change, so any
			// other open document that depends on this one (e.g. a template
			// using a component this file defines) must not keep stale
			// diagnostics either. Goes through the shared debounced runner, not
			// a direct call, so it can't run concurrently with (or fail to be
			// cancelled by) an in-flight debounced run for the same documents.
			debouncedReanalyze.schedule();
		}

		stopWatchingUnreferencedConfigFiles();
		// Releases any project no open document resolves to any more, the same
		// "still referenced" recompute as `stopWatchingUnreferencedConfigFiles`
		// just above, but for whole projects rather than just config watchers.
		registry.releaseUnreferencedProjects(openDocuments.values());
	});

	// The client isn't ready to answer `workspace/configuration` requests
	// until it has sent `initialized`, so the first pull happens here rather
	// than inside `onInitialize`. Not debounced: no document can be open yet
	// at this point in the LSP handshake, so this is always a no-op in
	// practice -- debouncing it would just delay that no-op and risk racing
	// a document opened moments later, for no benefit.
	connection.onInitialized(() => {
		void refreshWorkspaceSettings().then(() => reanalyzeOpenDocuments());

		// Dynamic registration, rather than declaring a `workspace/didChangeWatchedFiles`
		// capability up front, is the only way to ask the client to watch
		// files for us: this notification has no static capability of its
		// own to declare in `onInitialize`'s result. A client that never
		// declared support (`dynamicRegistration` not `true`) is left alone --
		// created, deleted and renamed files simply go unnoticed for it,
		// same as an unsupported `workspace/configuration` leaves settings
		// unsynced above.
		if (supportsFileWatcherRegistration) {
			connection.client
				.register(DidChangeWatchedFilesNotification.type, {
					watchers: [ { globPattern: '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}' } ],
				})
				.catch(error => {
					connection.console.error(`lit-language-server could not register a file watcher: ${ (error as Error).message }`);
				});
		}
	});

	connection.onDidChangeWatchedFiles(params => {
		// A file's own content change is already covered by that file's own
		// `didOpen`/`didChange` while it's open, and by the language
		// service reading disk fresh when it's not -- only a file appearing
		// or disappearing changes which files a project's tsconfig resolves
		// to, so only those two event types can invalidate a project's file
		// list.
		const affectedTsconfigPaths: Set<string> = new Set();
		for (const change of params.changes) {
			if (change.type === FileChangeType.Changed)
				continue;


			const fileName = fileURLToPath(change.uri);
			const tsconfigPath = findNearestTsconfig(path.dirname(fileName));
			if (tsconfigPath != null)
				affectedTsconfigPaths.add(tsconfigPath);
		}

		if (affectedTsconfigPaths.size === 0)
			return;


		// Only rebuilds a project that's already registered: a tsconfig no
		// open document has ever resolved to yet has no stale file list to
		// invalidate -- it will simply see the current state of disk the
		// first time it does boot.
		let rebuiltAny = false;
		for (const tsconfigPath of affectedTsconfigPaths) {
			if (registry.hasProject(tsconfigPath)) {
				connection.console.log(
					`lit-language-server detected a created or deleted file under ${ tsconfigPath }, rebuilding the project`,
				);
				registry.rebuildProject(tsconfigPath);
				rebuiltAny = true;
			}
		}

		if (rebuiltAny)
			debouncedReanalyze.schedule();
	});

	connection.onDidChangeConfiguration(() => {
		// The notification's own `settings` payload is ignored on purpose --
		// always re-pulling via `workspace/configuration` works for VS Code,
		// which always declares `workspace.configuration` support.
		// `refreshWorkspaceSettings` no-ops otherwise, so a push-only client
		// with no such support gets no configuration sync; that client is out
		// of scope for this slice.
		void refreshWorkspaceSettings().then(() => debouncedReanalyze.schedule());
	});

	connection.listen();

	return connection;
}
