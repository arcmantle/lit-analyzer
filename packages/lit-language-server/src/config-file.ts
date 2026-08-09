import * as path from 'node:path';

import {
	findNearestLitConfigFile,
	LIT_CONFIG_FILE_NAME,
	type LitAnalyzerConfig,
	makeConfig,
	readLitConfigFileOptions,
} from '@arcmantle/lit-analyzer';

export const CONFIG_FILE_NAME = LIT_CONFIG_FILE_NAME;

/**
 * Walks up from `startDir` looking for the nearest `lit-analyzer.config.json`.
 */
export function findNearestConfigFile(startDir: string): string | undefined {
	return findNearestLitConfigFile(startDir);
}

/**
 * Reads and parses a `lit-analyzer.config.json` into a full `LitAnalyzerConfig`.
 * Throws with a message naming the file on invalid JSON, rather than
 * returning defaults silently -- the caller decides how to report that and
 * whether to fall back.
 */
export function readConfigFile(configPath: string): LitAnalyzerConfig {
	return makeConfig(readLitConfigFileOptions(configPath));
}

export interface ResolvedConfig {
	/** The nearest config file found, or `undefined` if there wasn't one. */
	configPath: string | undefined;
	/**
	 * The config to use. Defaults (`makeConfig({})`) when there's no config
	 * file, or when the one found couldn't be parsed -- see `error` for that
	 * case.
	 */
	config:     LitAnalyzerConfig;
	/** Set when `configPath` was found but could not be parsed. */
	error?:     string;
}

/**
 * Resolves the config to use for `filePath`: the nearest
 * `lit-analyzer.config.json` walking up from its directory, or defaults if
 * none exists or the one found is invalid.
 */
export function resolveConfigForFile(filePath: string): ResolvedConfig {
	const configPath = findNearestConfigFile(path.dirname(filePath));
	if (configPath == null)
		return { configPath: undefined, config: makeConfig({}) };


	try {
		return { configPath, config: readConfigFile(configPath) };
	}
	catch (error) {
		return { configPath, config: makeConfig({}), error: (error as Error).message };
	}
}
