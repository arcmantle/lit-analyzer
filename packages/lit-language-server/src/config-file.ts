import * as fs from 'node:fs';
import * as path from 'node:path';

import { type LitAnalyzerConfig, makeConfig } from 'lit-analyzer';

export const CONFIG_FILE_NAME = 'lit-analyzer.config.json';

/**
 * Walks up from `startDir` looking for the nearest `lit-analyzer.config.json`.
 * Mirrors the "nearest file wins" walk tsconfig discovery will use later --
 * not shared code yet, since tsconfig discovery hasn't landed.
 */
export function findNearestConfigFile(startDir: string): string | undefined {
	let dir = startDir;

	for (;;) {
		const candidate = path.join(dir, CONFIG_FILE_NAME);
		if (fs.existsSync(candidate))
			return candidate;


		const parent = path.dirname(dir);
		if (parent === dir)
			return undefined;

		dir = parent;
	}
}

/**
 * Reads and parses a `lit-analyzer.config.json` into a full `LitAnalyzerConfig`.
 * Throws with a message naming the file on invalid JSON, rather than
 * returning defaults silently -- the caller decides how to report that and
 * whether to fall back.
 */
export function readConfigFile(configPath: string): LitAnalyzerConfig {
	const raw = fs.readFileSync(configPath, 'utf8');

	let userOptions: Partial<LitAnalyzerConfig>;
	try {
		userOptions = JSON.parse(raw) as Partial<LitAnalyzerConfig>;
	}
	catch (error) {
		throw new Error(`Could not parse ${ configPath } as JSON: ${ (error as Error).message }`);
	}

	return makeConfig(userOptions);
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
