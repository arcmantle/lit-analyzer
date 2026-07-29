import * as fs from 'node:fs';
import * as path from 'node:path';

import * as ts from 'typescript';

export const TSCONFIG_FILE_NAME = 'tsconfig.json';

/**
 * Walks up from `startDir` looking for the nearest `tsconfig.json`. Mirrors
 * `findNearestConfigFile`'s "nearest file wins" walk.
 */
export function findNearestTsconfig(startDir: string): string | undefined {
	let dir = startDir;

	for (;;) {
		const candidate = path.join(dir, TSCONFIG_FILE_NAME);
		if (fs.existsSync(candidate))
			return candidate;


		const parent = path.dirname(dir);
		if (parent === dir)
			return undefined;

		dir = parent;
	}
}

/** The root file names and compiler options resolved from a tsconfig. */
export interface ParsedTsconfig {
	fileNames: string[];
	options:   ts.CompilerOptions;
}

/**
 * Reads and parses a tsconfig with `ts.parseJsonConfigFileContent`, which
 * resolves `extends` (including into `node_modules`), `include`, `exclude`
 * and `files` the same way `tsc` does.
 */
export function parseTsconfig(tsconfigPath: string): ParsedTsconfig {
	const configDirectory = path.dirname(tsconfigPath);

	const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	if (configFile.error) {
		throw new Error(
			`Could not read ${ tsconfigPath }: ${ ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n') }`,
		);
	}


	const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configDirectory);
	if (parsedConfig.errors.length > 0) {
		const messages = parsedConfig.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n'));
		throw new Error(`Could not parse ${ tsconfigPath }:\n${ messages.join('\n') }`);
	}

	return { fileNames: parsedConfig.fileNames, options: parsedConfig.options };
}
