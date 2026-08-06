import { CompilerHost, CompilerOptions, createProgram, createSourceFile, CreateSourceFileOptions, IScriptSnapshot, LanguageServiceHost, Program, ScriptKind, ScriptSnapshot, ScriptTarget, SourceFile } from 'typescript';

export interface VirtualCompilerFile {
	fileName: string;
	text:     string;
	version?: string;
}

export interface VirtualCompilerHost {
	host:      CompilerHost;
	rootNames: readonly string[];
}

export function createVirtualLanguageServiceHost(
	host: LanguageServiceHost,
	virtualFiles: readonly VirtualCompilerFile[],
): LanguageServiceHost {
	const virtualFilesByName = new Map(virtualFiles.map(file => [ file.fileName, file ]));

	return {
		...host,
		getScriptFileNames(): string[] {
			return [ ...host.getScriptFileNames(), ...virtualFiles.map(file => file.fileName) ];
		},
		getScriptVersion(fileName: string): string {
			const file = virtualFilesByName.get(fileName);

			return file == null ? host.getScriptVersion(fileName) : file.version ?? file.text;
		},
		getScriptSnapshot(fileName: string): IScriptSnapshot | undefined {
			const file = virtualFilesByName.get(fileName);

			return file == null ? host.getScriptSnapshot(fileName) : ScriptSnapshot.fromString(file.text);
		},
		fileExists(fileName: string): boolean {
			return virtualFilesByName.has(fileName) || host.fileExists(fileName);
		},
		readFile(fileName: string, encoding?: string): string | undefined {
			return virtualFilesByName.get(fileName)?.text ?? host.readFile(fileName, encoding);
		},
	};
}

export function createVirtualCompilerHost(
	host: CompilerHost,
	rootNames: readonly string[],
	virtualFiles: readonly VirtualCompilerFile[],
): VirtualCompilerHost {
	const virtualFilesByName = new Map(virtualFiles.map(file => [ file.fileName, file ]));
	const virtualRootNames = [ ...rootNames, ...virtualFiles.map(file => file.fileName) ];

	const getVirtualSourceFile = (
		fileName: string,
		languageVersion: ScriptTarget | CreateSourceFileOptions,
	): SourceFile | undefined => {
		const file = virtualFilesByName.get(fileName);
		if (file == null)
			return undefined;

		const target = typeof languageVersion === 'number' ? languageVersion : languageVersion.languageVersion;

		return createSourceFile(fileName, file.text, target, true, ScriptKind.TS);
	};

	return {
		rootNames: virtualRootNames,
		host:      {
			...host,
			fileExists(fileName: string): boolean {
				return virtualFilesByName.has(fileName) || host.fileExists(fileName);
			},
			readFile(fileName: string): string | undefined {
				return virtualFilesByName.get(fileName)?.text ?? host.readFile(fileName);
			},
			getSourceFile(
				fileName: string,
				languageVersion: ScriptTarget | CreateSourceFileOptions,
				onError?: (message: string) => void,
				shouldCreateNewSourceFile?: boolean,
			): SourceFile | undefined {
				return getVirtualSourceFile(fileName, languageVersion)
				|| host.getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
			},
			getSourceFileByPath: host.getSourceFileByPath == null
				? undefined
				: (fileName, _path, languageVersion, onError, shouldCreateNewSourceFile) =>
					getVirtualSourceFile(fileName, languageVersion)
					|| host.getSourceFileByPath!(fileName, _path, languageVersion, onError, shouldCreateNewSourceFile),
		},
	};
}

export function createVirtualProgram(
	rootNames: readonly string[],
	options: CompilerOptions,
	host: CompilerHost,
	virtualFiles: readonly VirtualCompilerFile[],
	oldProgram?: Program,
): Program {
	const virtualHost = createVirtualCompilerHost(host, rootNames, virtualFiles);

	return createProgram({
		rootNames: virtualHost.rootNames,
		options,
		host:      virtualHost.host,
		oldProgram,
	});
}
