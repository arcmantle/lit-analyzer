import { ALL_RULE_IDS, LitAnalyzerRuleId } from '../../lib/analyze/lit-analyzer-config.js';
import { ALL_RULES } from '../../lib/rules/all-rules.js';
import { tsTest } from '../helpers/ts-test.js';

// `no-invalid-css` comes from the CSS service, not from a rule module.
const RULE_IDS_OUTSIDE_ALL_RULES: LitAnalyzerRuleId[] = [ 'no-invalid-css' ];

tsTest('Every configurable rule id has an implementation that emits it', t => {
	const implemented: Set<string> = new Set([ ...ALL_RULES.map(rule => rule.id), ...RULE_IDS_OUTSIDE_ALL_RULES ]);

	t.deepEqual(ALL_RULE_IDS.filter(ruleId => !implemented.has(ruleId)), []);
});
