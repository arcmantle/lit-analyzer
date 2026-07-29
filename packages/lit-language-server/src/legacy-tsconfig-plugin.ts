import type * as ts from 'typescript';

/** The plugin name the old tsserver-plugin path registered itself under. */
export const LEGACY_PLUGIN_NAME = 'ts-lit-plugin';

/**
 * True when `compilerOptions.plugins` still has an entry for the old
 * `ts-lit-plugin` tsconfig plugin. The language server never reads
 * configuration from this entry -- it only detects it, to report that the
 * user should move to `lit-analyzer.config.json`.
 */
export function hasLegacyPluginEntry(compilerOptions: ts.CompilerOptions): boolean {
	const plugins = compilerOptions.plugins;
	if (!Array.isArray(plugins))
		return false;


	return (plugins as unknown[]).some(
		plugin => typeof plugin === 'object' && plugin != null && (plugin as { name?: unknown; }).name === LEGACY_PLUGIN_NAME,
	);
}
