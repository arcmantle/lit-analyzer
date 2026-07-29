import { existsSync, readFileSync } from 'fs';
import { join, posix } from 'path';
import {
	CompilerHost,
	CompilerOptions,
	Extension,
	ModuleKind,
	ModuleResolutionKind,
	Program,
	ResolvedModuleWithFailedLookupLocations,
	ScriptKind,
	ScriptTarget,
	SourceFile,
	StringLiteralLike,
} from 'typescript';

import { getCurrentTsModule, getCurrentTsModuleDirectory } from './ts-test.js';


export interface ITestFile {
	fileName?:   string;
	text:        string;
	entry?:      boolean;
	includeLib?: boolean;
}

export type TestFile = ITestFile | string;

/**
 * Parsed TypeScript lib files, shared by every `compileFiles` call in the process.
 *
 * Each call builds a Program that pulls in the whole lib chain: 95 source files,
 * about 65 MB and 250 ms. Those files never change between tests, so parsing them
 * once per process rather than once per test is the difference between the suite
 * costing 65 MB per test and 65 MB in total.
 */
const libSourceFileCache: Map<string, SourceFile> = new Map();

/**
 * Compiles 'virtual' files with Typescript
 */
export function compileFiles(inputFiles: TestFile[] | TestFile = []): { program: Program; sourceFile: SourceFile; } {
	const ts = getCurrentTsModule();

	const files: ITestFile[] = (Array.isArray(inputFiles) ? inputFiles : [ inputFiles ])
		.map(file =>
			typeof file === 'string'
				? {
					text:     file,
					fileName: `auto-generated-${ Math.floor(Math.random() * 100000) }.ts`,
					entry:    true,
				}
				: {
					...file,
					fileName: file.fileName || `auto-generated-${ Math.floor(Math.random() * 100000) }.ts`,
				})
		.map(file => ({ ...file, fileName: file.fileName }));

	const entryFile = files.find(file => file.entry === true) || files[0];

	const includeLib = true; //files.find(file => file.includeLib) != null;

	const readFile = (fileName: string): string | undefined => {
		const matchedFile = files.find(currentFile => currentFile.fileName === fileName);
		if (matchedFile != null)
			return matchedFile.text;


		if (includeLib)
			fileName = fileName.match(/[/\\]/) ? fileName : join(getCurrentTsModuleDirectory(), fileName);


		if (existsSync(fileName))
			return readFileSync(fileName, 'utf8').toString();


		return undefined;
	};
	const fileExists = (fileName: string): boolean => {
		return files.some(currentFile => currentFile.fileName === fileName);
	};

	/**
	 * Resolves a module specifier against the virtual files.
	 *
	 * These files only exist in memory, so no filesystem-based resolution
	 * algorithm can find them. The host resolves them itself: a bare specifier
	 * ("file1") names a file at the root, a relative one ("./file1") resolves
	 * against the importing file.
	 */
	const resolveVirtualModule = (moduleName: string, containingFile: string): string | undefined => {
		const base = moduleName.startsWith('.') ? posix.join(posix.dirname(containingFile), moduleName) : moduleName;

		return [ base, `${ base }.ts`, `${ base }.tsx`, `${ base }.d.ts` ].find(candidate => fileExists(candidate));
	};

	const compilerOptions: CompilerOptions = {
		module:           ModuleKind.ESNext,
		moduleResolution: ModuleResolutionKind.Bundler,
		target:           ScriptTarget.ESNext,
		allowJs:          true,
		sourceMap:        false,
		strict:           true, // if strict = false, "undefined" and "null" will be removed from unions types.
	};

	const compilerHost: CompilerHost = {
		writeFile: () => {},
		readFile,
		fileExists,
		getSourceFile(fileName: string, languageVersion: ScriptTarget): SourceFile | undefined {
			// Virtual files are different in every test; lib files are identical in
			// all of them, so only the lib files are worth holding on to.
			const isVirtualFile = fileExists(fileName);
			const cacheKey = `${ fileName }|${ languageVersion }`;

			if (!isVirtualFile) {
				const cached = libSourceFileCache.get(cacheKey);
				if (cached != null)
					return cached;
			}

			const sourceText = this.readFile(fileName);
			if (sourceText == null)
				return undefined;

			const sourceFile = ts.createSourceFile(fileName, sourceText, languageVersion, true, ScriptKind.TS);

			if (!isVirtualFile)
				libSourceFileCache.set(cacheKey, sourceFile);


			return sourceFile;
		},

		resolveModuleNameLiterals(
			moduleLiterals: readonly StringLiteralLike[],
			containingFile: string,
		): readonly ResolvedModuleWithFailedLookupLocations[] {
			return moduleLiterals.map(literal => {
				const resolvedFileName = resolveVirtualModule(literal.text, containingFile);
				if (resolvedFileName == null)
					return { resolvedModule: undefined };


				return {
					resolvedModule: {
						resolvedFileName,
						extension: resolvedFileName.endsWith(Extension.Dts)
							? Extension.Dts
							: resolvedFileName.endsWith(Extension.Tsx)
								? Extension.Tsx
								: Extension.Ts,
						// The tests decide what counts as external themselves, by
						// overriding `program.isSourceFileFromExternalLibrary` below.
						isExternalLibraryImport: false,
					},
				};
			});
		},

		getCurrentDirectory() {
			return './';
		},

		getDirectories(directoryName: string) {
			return ts.sys.getDirectories(directoryName);
		},

		getDefaultLibFileName(options: CompilerOptions): string {
			return ts.getDefaultLibFileName(options);
		},

		getCanonicalFileName(fileName: string): string {
			return this.useCaseSensitiveFileNames() ? fileName : fileName.toLowerCase();
		},

		getNewLine(): string {
			return ts.sys.newLine;
		},

		useCaseSensitiveFileNames() {
			return ts.sys.useCaseSensitiveFileNames;
		},
	};

	const program = ts.createProgram({
		rootNames: [ ...files.map(file => file.fileName!) ],
		options:   compilerOptions,
		host:      compilerHost,
	});

	// We need to overwrite this so the traversal of external modules can be tested.
	program.isSourceFileFromExternalLibrary = (sourceFile: SourceFile): boolean => {
		const filename = sourceFile.fileName;

		return filename.includes('node_modules');
	};

	const entrySourceFile = entryFile.fileName != null ? program.getSourceFile(entryFile.fileName)! : program.getSourceFiles()[0];

	return {
		program,
		sourceFile: entrySourceFile,
	};
}
