import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import type * as ts from 'typescript';

const TYPESCRIPT_LIBRARY_NAME = /^lib(?:\.[a-z0-9_-]+)+\.d\.ts$/i;

export interface BundledTypeScriptDefinition {
	uriPath: string;
	start:   number;
	length:  number;
}

export interface BundledTypeScriptQuickInfo {
	display:       string;
	documentation: string;
	start:         number;
	length:        number;
}

export class BundledTypeScriptLibrary {

	private readonly libraryDirectory: string;
	private readonly typescript:       typeof ts;
	private readonly languageServices: Map<string, ts.LanguageService> = new Map();

	constructor(extensionPath: string, libraryDirectory = path.join(extensionPath, 'node_modules', 'typescript', 'lib')) {
		this.libraryDirectory = libraryDirectory;
		this.typescript = createRequire(import.meta.url)(path.join(libraryDirectory, 'typescript.js')) as typeof ts;
	}

	read(uriPath: string): Promise<string> {
		return readFile(this.libraryPath(uriPath), 'utf8');
	}

	getDefinitions(uriPath: string, position: number): BundledTypeScriptDefinition[] {
		const sourcePath = this.libraryPath(uriPath);
		const languageService = this.getLanguageService(sourcePath);

		return (languageService.getDefinitionAtPosition(sourcePath, position) ?? [])
			.flatMap(definition => {
				const libraryName = path.basename(definition.fileName);
				if (!this.isLibraryDirectory(path.dirname(definition.fileName)) || !TYPESCRIPT_LIBRARY_NAME.test(libraryName))
					return [];

				return [
					{
						uriPath: `/${ libraryName }`,
						start:   definition.textSpan.start,
						length:  definition.textSpan.length,
					},
				];
			});
	}

	getQuickInfo(uriPath: string, position: number): BundledTypeScriptQuickInfo | undefined {
		const sourcePath = this.libraryPath(uriPath);
		const quickInfo = this.getLanguageService(sourcePath).getQuickInfoAtPosition(sourcePath, position);
		if (quickInfo == null)
			return undefined;

		return {
			display:       this.typescript.displayPartsToString(quickInfo.displayParts),
			documentation: this.typescript.displayPartsToString(quickInfo.documentation),
			start:         quickInfo.textSpan.start,
			length:        quickInfo.textSpan.length,
		};
	}

	private getLanguageService(sourcePath: string): ts.LanguageService {
		const languageService = this.languageServices.get(sourcePath) ?? this.createLanguageService(sourcePath);
		this.languageServices.set(sourcePath, languageService);

		return languageService;
	}

	private createLanguageService(sourcePath: string): ts.LanguageService {
		const defaultLibraryPath = path.join(this.libraryDirectory, 'lib.d.ts');
		const { fileExists, readFile, readDirectory } = this.typescript.sys;
		const host: ts.LanguageServiceHost = {
			getCompilationSettings: () => ({}),
			getScriptFileNames:     () => [ defaultLibraryPath, sourcePath ],
			getScriptVersion:       () => '0',
			getScriptSnapshot:      fileName => {
				const text = this.typescript.sys.readFile(fileName);

				return text == null ? undefined : this.typescript.ScriptSnapshot.fromString(text);
			},
			getCurrentDirectory:   () => this.libraryDirectory,
			getDefaultLibFileName: () => defaultLibraryPath,
			fileExists,
			readFile,
			readDirectory,
		};

		return this.typescript.createLanguageService(host);
	}

	private isLibraryDirectory(directory: string): boolean {
		const canonicalPath = (value: string): string => {
			const normalized = path.resolve(value).replaceAll(path.sep, '/');

			return this.typescript.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
		};

		return canonicalPath(directory) === canonicalPath(this.libraryDirectory);
	}

	private libraryPath(uriPath: string): string {
		const libraryName = path.posix.basename(uriPath);
		if (!TYPESCRIPT_LIBRARY_NAME.test(libraryName) || uriPath !== `/${ libraryName }`)
			throw new Error(`Invalid bundled TypeScript library URI path: ${ uriPath }`);

		return path.join(this.libraryDirectory, libraryName);
	}

}

export async function readBundledTypeScriptLibrary(extensionPath: string, uriPath: string): Promise<string> {
	return new BundledTypeScriptLibrary(extensionPath).read(uriPath);
}
