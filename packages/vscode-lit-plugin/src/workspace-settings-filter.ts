import { ALL_RULE_IDS } from 'lit-analyzer';

const NON_RULE_SETTING_KEYS = [
	'disable',
	'strict',
	'securitySystem',
	'maxProjectImportDepth',
	'maxNodeModuleImportDepth',
	'htmlTemplateTags',
	'cssTemplateTags',
	'dontShowSuggestions',
	'globalTags',
	'globalAttributes',
	'globalEvents',
	'logging',
	'customHtmlData',
] as const;

/**
 * What `filterExplicitLitPluginSettings` needs from `vscode.WorkspaceConfiguration` --
 * kept minimal so this logic is unit-testable without a real VS Code host.
 */
export interface InspectedConfigValue {
	globalValue?:                  unknown;
	workspaceValue?:               unknown;
	workspaceFolderValue?:         unknown;
	globalLanguageValue?:          unknown;
	workspaceLanguageValue?:       unknown;
	workspaceFolderLanguageValue?: unknown;
}

export interface InspectableConfiguration {
	get(key: string): unknown;
	inspect(key: string): InspectedConfigValue | undefined;
}

/**
 * True when the user chose a value for `key` at some scope, rather than
 * VS Code falling back to the setting's own schema default. `get()` alone
 * can't tell these apart -- it returns the schema default too -- which is
 * why the old `api.configurePlugin` path (`extension.ts`'s prior
 * `withConfigValue`) always checked `inspect()` first.
 */
export function isExplicitlySet(config: InspectableConfiguration, key: string): boolean {
	const inspected = config.inspect(key);
	if (inspected == null)
		return false;


	return (
		inspected.globalValue !== undefined ||
		inspected.workspaceValue !== undefined ||
		inspected.workspaceFolderValue !== undefined ||
		inspected.globalLanguageValue !== undefined ||
		inspected.workspaceLanguageValue !== undefined ||
		inspected.workspaceFolderLanguageValue !== undefined
	);
}

/**
 * Reads the `lit-plugin` configuration section down to only the fields the
 * user explicitly set. The language server treats every field it receives
 * over `workspace/configuration` as a real override, and merges `rules`
 * instead of replacing it wholesale -- so a field VS Code reports only
 * because of the setting's own schema default must never reach the server,
 * or it would silently override the config file for that field.
 */
export function filterExplicitLitPluginSettings(config: InspectableConfiguration): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const key of NON_RULE_SETTING_KEYS) {
		if (isExplicitlySet(config, key))
			result[key] = config.get(key);
	}

	const rules: Record<string, unknown> = {};
	for (const ruleId of ALL_RULE_IDS) {
		const key = `rules.${ ruleId }`;
		if (isExplicitlySet(config, key))
			rules[ruleId] = config.get(key);
	}
	if (Object.keys(rules).length > 0)
		result.rules = rules;


	return result;
}
