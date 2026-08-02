import * as fs from 'node:fs';
import * as path from 'node:path';

import type { LitAnalyzerConfig } from './lit-analyzer-config.js';

export const LIT_CONFIG_FILE_NAME = 'lit-analyzer.config.json';

/**
 * Walks up from `startDir` looking for the nearest `lit-analyzer.config.json`.
 */
export function findNearestLitConfigFile(startDir: string): string | undefined {
	let dir = startDir;

	for (;;) {
		const candidate = path.join(dir, LIT_CONFIG_FILE_NAME);
		if (fs.existsSync(candidate))
			return candidate;


		const parent = path.dirname(dir);
		if (parent === dir)
			return undefined;

		dir = parent;
	}
}

/**
 * Reads a `lit-analyzer.config.json` and returns the raw user options, so that
 * callers can merge them with other option sources before `makeConfig` fills
 * in defaults.
 *
 * Throws with a message naming the file on invalid JSON, rather than returning
 * defaults silently -- the caller decides how to report that and whether to
 * fall back.
 */
export function readLitConfigFileOptions(configPath: string): Partial<LitAnalyzerConfig> {
	const raw = fs.readFileSync(configPath, 'utf8');

	try {
		return JSON.parse(raw) as Partial<LitAnalyzerConfig>;
	}
	catch (error) {
		throw new Error(`Could not parse ${ configPath } as JSON: ${ (error as Error).message }`);
	}
}

export interface ResolvedLitConfigOptions {
	/** The nearest config file found, or `undefined` if there wasn't one. */
	configPath: string | undefined;
	/** The user options from that file, or `{}` when there is none or it is invalid. */
	options:    Partial<LitAnalyzerConfig>;
	/** Set when `configPath` was found but could not be parsed. */
	error?:     string;
}

/**
 * Resolves the user options to use for `filePath`: the nearest
 * `lit-analyzer.config.json` walking up from its directory.
 */
export function resolveLitConfigOptionsForFile(filePath: string): ResolvedLitConfigOptions {
	return resolveLitConfigOptionsInDirectory(path.dirname(filePath));
}

/**
 * Resolves the user options to use for anything inside `directory`.
 */
export function resolveLitConfigOptionsInDirectory(directory: string): ResolvedLitConfigOptions {
	const configPath = findNearestLitConfigFile(directory);
	if (configPath == null)
		return { configPath: undefined, options: {} };


	try {
		return { configPath, options: readLitConfigFileOptions(configPath) };
	}
	catch (error) {
		return { configPath, options: {}, error: (error as Error).message };
	}
}
