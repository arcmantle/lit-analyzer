import { DefaultLitAnalyzerContext } from '../../lib/analyze/default-lit-analyzer-context.js';
import { LitAnalyzer } from '../../lib/analyze/lit-analyzer.js';
import { ALL_RULE_IDS, LitAnalyzerRuleId, makeConfig } from '../../lib/analyze/lit-analyzer-config.js';
import { ALL_RULES } from '../../lib/rules/all-rules.js';
import { compileFiles } from '../helpers/compile-files.js';
import { tsTest } from '../helpers/ts-test.js';
import { getCurrentTsModule } from '../helpers/ts-test.js';

// `no-invalid-css` comes from the CSS service, not from a rule module.
const RULE_IDS_OUTSIDE_ALL_RULES: LitAnalyzerRuleId[] = [ 'no-invalid-css' ];

tsTest('Every configurable rule id has an implementation that emits it', t => {
	const implemented: Set<string> = new Set([ ...ALL_RULES.map(rule => rule.id), ...RULE_IDS_OUTSIDE_ALL_RULES ]);

	t.deepEqual(ALL_RULE_IDS.filter(ruleId => !implemented.has(ruleId)), []);
});

tsTest('enables all binding formatters by default', t => {
	t.deepEqual(makeConfig({}).format, {
		disable:                 false,
		groupBindings:           true,
		newLineBindings:         true,
		newLineTemplate:         true,
		alignBindingAssignments: true,
	});
});

tsTest('logs template rule timings at debug level', t => {
	const messages: string[] = [];
	const { program, sourceFile } = compileFiles([ 'declare const value: string; html`<input placeholder="${value}" />`' ]);
	const context = new DefaultLitAnalyzerContext({
		ts:         getCurrentTsModule(),
		getProgram: () => program,
		log:        message => messages.push(message),
	});
	const analyzer = new LitAnalyzer(context);
	context.updateConfig(makeConfig({ logging: 'debug' }));
	const diagnostics = analyzer.getDiagnosticsInFile(sourceFile);

	t.is(diagnostics.length, 0);
	t.true(messages.some(message => message.includes('template rule timings')));
	t.true(messages.some(message => message.includes('no-incompatible-type-binding')));
});
