import { existsSync, readFileSync } from 'fs';
import {
	CompilerOptions,
	createProgram,
	findConfigFile,
	ModuleKind,
	ModuleResolutionKind,
	parseJsonConfigFileContent,
	Program,
	readConfigFile,
	ScriptTarget,
	SourceFile,
	sys,
} from 'typescript';

import { LitAnalyzerConfig } from '../analyze/lit-analyzer-config.js';

const requiredCompilerOptions: CompilerOptions = {
	noEmitOnError:    false,
	noEmit:           true,
	allowJs:          true,
	//maxNodeModuleJsDepth: 3,
	strictNullChecks: true, // Type checking will remove all "null" and "undefined" from types if "strictNullChecks" is false
	skipLibCheck:     true,
};

/**
 * The most general version of compiler options.
 */
const defaultCompilerOptions: CompilerOptions = {
	...requiredCompilerOptions,
	experimentalDecorators:       true,
	target:                       ScriptTarget.Latest,
	module:                       ModuleKind.ESNext,
	//module: ModuleKind.CommonJS,
	moduleResolution:             ModuleResolutionKind.Bundler,
	esModuleInterop:              true,
	allowSyntheticDefaultImports: true,
	allowUnreachableCode:         true,
	allowUnusedLabels:            true,
	lib:                          [ 'lib.esnext.d.ts', 'lib.dom.d.ts' ],
};

export interface CompileResult {
	program:        Program;
	files:          SourceFile[];
	pluginOptions?: LitAnalyzerConfig;
}

/**
 * Compiles an array of file paths using typescript.
 * @param filePaths
 */
export function compileTypescript(filePaths: string | string[]): CompileResult {
	const options = getCompilerOptions();
	filePaths = Array.isArray(filePaths) ? filePaths : [ filePaths ];
	const program = createProgram(filePaths, options);
	const files = program
		.getSourceFiles()
		.filter(sf => filePaths.includes(sf.fileName))
		.sort((sfA, sfB) => (sfA.fileName > sfB.fileName ? 1 : -1));

	return { program, files };
}

/**
 * Returns compiler options to be used
 */
export function getCompilerOptions(): CompilerOptions {
	// Get compiler options from files
	const compilerOptions = resolveTsConfigCompilerOptions();

	// If we found existing compiler options, merged "required compiler options" into it.
	if (compilerOptions != null) {
		const options = {
			...compilerOptions,
			...requiredCompilerOptions,
		};
		// Classic resolution cannot find anything in node_modules, and is removed in
		// TypeScript 7 along with the other pre-Node16 modes. Upgrade it, and an
		// absent setting, to Bundler: the most permissive mode that survives, and
		// the one least likely to leave a user's imports unresolved.
		// If the user chose a mode themselves, leave it alone.
		if (!options.moduleResolution || options.moduleResolution === ModuleResolutionKind.Classic)
			options.moduleResolution = ModuleResolutionKind.Bundler;

		return options;
	}

	// Return default compiler options if no compiler options were found
	return defaultCompilerOptions;
}

/**
 * Resolves "tsconfig.json" file and returns its CompilerOptions
 */
export function resolveTsConfigCompilerOptions(): CompilerOptions | undefined {
	// Find the nearest tsconfig.json file if possible
	const tsConfigFilePath = findConfigFile(process.cwd(), existsSync, 'tsconfig.json');

	if (tsConfigFilePath != null) {
		// Read the tsconfig.json file
		const parsedConfig = readConfigFile(tsConfigFilePath, path => readFileSync(path, 'utf8'));
		if (parsedConfig != null && parsedConfig.config != null) {
			// Parse the tsconfig.json file
			const parsedJson = parseJsonConfigFileContent(parsedConfig.config, sys, process.cwd());

			return parsedJson?.options;
		}
	}

	return undefined;
}

/**
 * Resolves the nearest tsconfig.json and returns the configuration seed within the plugins section for "ts-lit-plugin"
 */
export function readLitAnalyzerConfigFromTsConfig(): Partial<LitAnalyzerConfig> | undefined {
	const compilerOptions = resolveTsConfigCompilerOptions();

	// Finds the plugin section
	if (compilerOptions != null && 'plugins' in compilerOptions) {
		const plugins = compilerOptions.plugins as ({ name: string; } & Partial<LitAnalyzerConfig>)[];
		const tsLitPluginOptions = plugins.find(plugin => plugin.name === 'ts-lit-plugin');
		if (tsLitPluginOptions != null)
			return tsLitPluginOptions;
	}

	return undefined;
}
