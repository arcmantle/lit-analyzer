import { resolve, sep } from 'node:path';

import * as tsModule from 'typescript';
import { CompilerOptions, createCompilerHost, ModuleKind, ModuleResolutionKind, Program, ScriptTarget, SourceFile } from 'typescript';

import { createJSDocProgram } from '../../analyze/util/jsdoc-compiler-host.js';

/**
 * The most general version of compiler options.
 */
const defaultOptions: CompilerOptions = {
	noEmitOnError:                false,
	allowJs:                      true,
	maxNodeModuleJsDepth:         3,
	experimentalDecorators:       true,
	target:                       ScriptTarget.Latest,
	downlevelIteration:           true,
	module:                       ModuleKind.ESNext,
	//module: ModuleKind.CommonJS,
	//lib: ["ESNext", "DOM", "DOM.Iterable"],
	strictNullChecks:             true,
	moduleResolution:             ModuleResolutionKind.NodeJs,
	esModuleInterop:              true,
	noEmit:                       true,
	allowSyntheticDefaultImports: true,
	allowUnreachableCode:         true,
	allowUnusedLabels:            true,
	skipLibCheck:                 true,
};

export interface CompileResult {
	program: Program;
	files:   SourceFile[];
}

/**
 * Compiles an array of file paths using typescript.
 * @param filePaths
 * @param options
 */
export function compileTypescript(filePaths: string | string[], options: CompilerOptions = defaultOptions): CompileResult {
	filePaths = Array.isArray(filePaths) ? filePaths : [ filePaths ];
	const program = createJSDocProgram(filePaths, options, createCompilerHost(options), tsModule);
	const canonicalFileNames = new Set(filePaths.map(canonicalFileName));
	const files = program
		.getSourceFiles()
		.filter(sf => canonicalFileNames.has(canonicalFileName(sf.fileName)))
		.sort((sfA, sfB) => (sfA.fileName > sfB.fileName ? 1 : -1));

	return { program, files };
}

function canonicalFileName(fileName: string): string {
	const normalized = resolve(fileName).replaceAll(sep, '/');

	return tsModule.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}
