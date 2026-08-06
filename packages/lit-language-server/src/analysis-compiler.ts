import * as fs from 'node:fs';
import * as path from 'node:path';

import ts from 'typescript';
import { createJSDocLanguageServiceHost } from 'web-component-analyzer';

import { parseTsconfig } from './tsconfig-file.js';

/**
 * The analysis compiler for a single project: boots a TypeScript
 * `LanguageService` from a tsconfig on disk and hands back the `Program` it
 * builds.
 *
 * Deliberately simple for now: one hardcoded tsconfig path and no
 * multi-project discovery. Unsaved documents (opened, changed or closed
 * through the editor) are tracked in memory and take priority over disk
 * content; a closed document falls back to disk again.
 */
export interface AnalysisCompiler {
	/** Builds (or rebuilds) and returns the `Program` for this tsconfig. */
	getProgram(): ts.Program;
	/**
	 * Signature help for a call, construct, or tagged template expression at
	 * `position` -- delegates straight to the underlying `ts.LanguageService`,
	 * not the analyzer core: an ordinary TypeScript call (e.g. a directive
	 * invoked inside a template) needs no lit-specific handling, only the tag
	 * function's own signature (from `html`/`css`) needs filtering out, which
	 * the caller does. `triggerReason` is forwarded as-is from the client's own
	 * request, the same way `ts-lit-plugin` forwards tsserver's, so a
	 * retrigger (e.g. typing `,` to move to the next parameter) keeps the
	 * active signature stable instead of resetting it.
	 */
	getSignatureHelpItems(
		fileName: string,
		position: number,
		triggerReason?: ts.SignatureHelpTriggerReason,
	): ts.SignatureHelpItems | undefined;
	/** The root file names resolved from the tsconfig, before type-checking. */
	getRootFileNames(): readonly string[];
	/** The compiler options resolved from the tsconfig. */
	getCompilerOptions(): ts.CompilerOptions;
	/**
	 * Tracks a document's unsaved content, taking priority over disk for
	 * every subsequent `getProgram()` call.
	 */
	openDocument(fileName: string, text: string): void;
	/**
	 * Replaces a tracked document's content. A no-op when the content is
	 * unchanged, so the reported script version -- and the `Program` --
	 * only changes when the content actually does.
	 */
	updateDocument(fileName: string, text: string): void;
	/** Stops tracking a document; its content reverts to disk. */
	closeDocument(fileName: string): void;
}

/** An unsaved document's tracked content and its monotonically increasing version. */
interface TrackedDocument {
	text:    string;
	version: number;
}

/** What a `LanguageServiceHost` needs to know, whether it comes from a parsed tsconfig or an inferred, tsconfig-less project. */
interface LanguageServiceSource {
	getRootFileNames(): readonly string[];
	getCompilerOptions(): ts.CompilerOptions;
	getCurrentDirectory(): string;
	/** Used only in the "could not build a Program" error message below. */
	describeProject(): string;
}

/**
 * Builds the `AnalysisCompiler` shared by both a tsconfig-backed project and
 * an inferred, tsconfig-less one -- the only difference between the two is
 * where the root file names, compiler options and current directory come
 * from. Unsaved documents (opened, changed or closed through the editor)
 * are tracked in memory and take priority over disk content; a closed
 * document falls back to disk again.
 */
function createLanguageServiceCompiler(source: LanguageServiceSource): AnalysisCompiler {
	const openDocuments: Map<string, TrackedDocument> = new Map();

	const host: ts.LanguageServiceHost = {
		getScriptFileNames: () => [ ...source.getRootFileNames() ],
		// Reports the tracked document's version when one is open, so the
		// language service only re-parses a file when its content actually
		// changes; a disk-backed file that is never opened keeps a fixed
		// version and so is never redundantly re-parsed either.
		getScriptVersion:   fileName => {
			const tracked = openDocuments.get(fileName);

			return tracked ? String(tracked.version) : '0';
		},
		getScriptSnapshot: fileName => {
			const tracked = openDocuments.get(fileName);
			if (tracked)
				return ts.ScriptSnapshot.fromString(tracked.text);

			if (!fs.existsSync(fileName))
				return undefined;

			return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
		},
		getCurrentDirectory:    () => source.getCurrentDirectory(),
		getCompilationSettings: () => source.getCompilerOptions(),
		getDefaultLibFileName:  options => ts.getDefaultLibFilePath(options),
		fileExists:             ts.sys.fileExists,
		readFile:               ts.sys.readFile,
		readDirectory:          ts.sys.readDirectory,
		directoryExists:        ts.sys.directoryExists,
		getDirectories:         ts.sys.getDirectories,
	};

	const jsDocHost = createJSDocLanguageServiceHost(host, ts);
	const languageService = ts.createLanguageService(jsDocHost.host);

	return {
		getProgram(): ts.Program {
			let program = languageService.getProgram();
			if (!program)
				throw new Error(`The language service could not build a Program for ${ source.describeProject() }`);

			if (jsDocHost.update(program)) {
				program = languageService.getProgram();
				if (!program)
					throw new Error(`The language service could not build a Program for ${ source.describeProject() }`);
			}

			return program;
		},
		getSignatureHelpItems(
			fileName: string,
			position: number,
			triggerReason?: ts.SignatureHelpTriggerReason,
		): ts.SignatureHelpItems | undefined {
			return languageService.getSignatureHelpItems(fileName, position, triggerReason && { triggerReason });
		},
		getRootFileNames:   () => source.getRootFileNames(),
		getCompilerOptions: () => source.getCompilerOptions(),
		openDocument(fileName: string, text: string): void {
			openDocuments.set(fileName, { text, version: 1 });
		},
		updateDocument(fileName: string, text: string): void {
			const tracked = openDocuments.get(fileName);
			if (tracked && tracked.text === text)
				return;

			openDocuments.set(fileName, { text, version: (tracked?.version ?? 0) + 1 });
		},
		closeDocument(fileName: string): void {
			openDocuments.delete(fileName);
		},
	};
}

export function createAnalysisCompiler(tsconfigPath: string): AnalysisCompiler {
	const configDirectory = path.dirname(tsconfigPath);
	const parsedConfig = parseTsconfig(tsconfigPath);

	return createLanguageServiceCompiler({
		getRootFileNames:    () => parsedConfig.fileNames,
		getCompilerOptions:  () => parsedConfig.options,
		getCurrentDirectory: () => configDirectory,
		describeProject:     () => tsconfigPath,
	});
}

/**
 * Default compiler options for a file with no tsconfig.json anywhere above
 * it -- modern syntax and JS interop, so the file's own diagnostics aren't
 * drowned out by "can't use this syntax" noise from an assumed old default
 * target the way `ts.getDefaultCompilerOptions()` would.
 */
const INFERRED_PROJECT_COMPILER_OPTIONS: ts.CompilerOptions = {
	target:           ts.ScriptTarget.ESNext,
	module:           ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	allowJs:          true,
};

/**
 * The analysis compiler for a single standalone file with no tsconfig.json
 * anywhere above it -- an inferred project, mirroring what tsserver calls
 * an inferred project, holding just that one file and whatever it
 * resolvably imports (TypeScript resolves and adds those to the `Program`
 * on its own; nothing else is scanned or included). Deliberately quieter
 * than a real project: no `include`/`exclude`, no project-wide strictness
 * from a tsconfig that doesn't exist, just enough to give this one file
 * useful diagnostics.
 */
export function createInferredAnalysisCompiler(fileName: string): AnalysisCompiler {
	return createLanguageServiceCompiler({
		getRootFileNames:    () => [ fileName ],
		getCompilerOptions:  () => INFERRED_PROJECT_COMPILER_OPTIONS,
		getCurrentDirectory: () => path.dirname(fileName),
		describeProject:     () => `the inferred project for ${ fileName }`,
	});
}
