import {
	ALL_RULE_IDS,
	type LitAnalyzerConfig,
	type LitAnalyzerLogging,
	type LitAnalyzerRules,
	type LitAnalyzerRuleSeverity,
	type LitSecuritySystem,
} from '@arcmantle/lit-analyzer';

/**
 * The raw shape of the `lit-plugin` VS Code configuration section, as
 * returned by `workspace/configuration`. The client only includes a field
 * here when the user explicitly set it (see `workspace-settings-filter.ts`
 * in `vscode-lit-plugin`) -- VS Code itself would otherwise report a value
 * for every field, falling back to the setting's own schema default.
 */
export interface RawWorkspaceSettings {
	disable?:                  unknown;
	strict?:                   unknown;
	securitySystem?:           unknown;
	maxProjectImportDepth?:    unknown;
	maxNodeModuleImportDepth?: unknown;
	htmlTemplateTags?:         unknown;
	cssTemplateTags?:          unknown;
	dontShowSuggestions?:      unknown;
	globalTags?:               unknown;
	globalAttributes?:         unknown;
	globalEvents?:             unknown;
	logging?:                  unknown;
	customHtmlData?:           unknown;
	rules?:                    unknown;
}

/**
 * Parses the raw `lit-plugin` settings object the client answers
 * `workspace/configuration` with into a `Partial<LitAnalyzerConfig>`.
 *
 * A per-rule value of `"default"` -- the setting's own default -- means the
 * user made no choice for that rule, so it's left out of the result rather
 * than passed through as a rule value. This is checked here too, on top of
 * the client's own filtering, because a user can explicitly choose
 * `"default"` from the setting's dropdown to mean "no override", which the
 * client's inspect-based filtering can't distinguish from an untouched
 * setting.
 */
export function parseWorkspaceSettings(raw: unknown): Partial<LitAnalyzerConfig> {
	if (raw == null || typeof raw !== 'object')
		return {};


	const settings = raw as RawWorkspaceSettings;
	const result: Partial<LitAnalyzerConfig> = {};

	if (typeof settings.disable === 'boolean')
		result.disable = settings.disable;
	if (typeof settings.strict === 'boolean')
		result.strict = settings.strict;
	if (typeof settings.securitySystem === 'string')
		result.securitySystem = settings.securitySystem as LitSecuritySystem;
	if (typeof settings.maxProjectImportDepth === 'number')
		result.maxProjectImportDepth = settings.maxProjectImportDepth;
	if (typeof settings.maxNodeModuleImportDepth === 'number')
		result.maxNodeModuleImportDepth = settings.maxNodeModuleImportDepth;
	if (Array.isArray(settings.htmlTemplateTags))
		result.htmlTemplateTags = settings.htmlTemplateTags as string[];
	if (Array.isArray(settings.cssTemplateTags))
		result.cssTemplateTags = settings.cssTemplateTags as string[];
	if (typeof settings.dontShowSuggestions === 'boolean')
		result.dontShowSuggestions = settings.dontShowSuggestions;
	if (Array.isArray(settings.globalTags))
		result.globalTags = settings.globalTags as string[];
	if (Array.isArray(settings.globalAttributes))
		result.globalAttributes = settings.globalAttributes as string[];
	if (Array.isArray(settings.globalEvents))
		result.globalEvents = settings.globalEvents as string[];
	if (typeof settings.logging === 'string')
		result.logging = settings.logging as LitAnalyzerLogging;
	if (settings.customHtmlData != null)
		result.customHtmlData = settings.customHtmlData as LitAnalyzerConfig['customHtmlData'];

	const rawRules = settings.rules;
	if (rawRules != null && typeof rawRules === 'object') {
		const rules: LitAnalyzerRules = {};
		for (const ruleId of ALL_RULE_IDS) {
			const value = (rawRules as Record<string, unknown>)[ruleId];
			if (value != null && value !== 'default')
				rules[ruleId] = value as LitAnalyzerRuleSeverity;
		}
		if (Object.keys(rules).length > 0)
			result.rules = rules;
	}

	return result;
}

/**
 * Merges workspace settings over a fully-resolved config (typically from
 * `resolveConfigForFile`). Settings win for any field they set, but `rules`
 * is merged key by key rather than replaced wholesale -- a rule the
 * settings don't mention keeps whatever the config file said about it.
 */
export function mergeConfig(base: LitAnalyzerConfig, overrides: Partial<LitAnalyzerConfig>): LitAnalyzerConfig {
	return {
		...base,
		...overrides,
		rules: { ...base.rules, ...overrides.rules },
	};
}
