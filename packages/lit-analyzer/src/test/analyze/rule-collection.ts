import { RuleCollection } from '../../lib/analyze/rule-collection.js';
import { RuleModule } from '../../lib/analyze/types/rule/rule-module.js';
import { prepareAnalyzer } from '../helpers/analyze.js';
import { parseHtml } from '../helpers/parse-html.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('defers expensive assignment rules and skips them after a cheap diagnostic', t => {
	const calls: string[] = [];
	const cheapRule: RuleModule = {
		id: 'no-invalid-directive-binding',
		visitHtmlAssignment(assignment, context) {
			calls.push(`cheap:${ assignment.htmlAttr.name }`);
			if (assignment.htmlAttr.name === 'first') {
				context.report({
					location: { start: 0, end: 0 },
					message:  'Skip type validation.',
				});
			}
		},
	};
	const expensiveRule: RuleModule = {
		id:   'no-incompatible-type-binding',
		meta: { phase: 'expensive' },
		visitHtmlAssignment(assignment) {
			calls.push(`expensive:${ assignment.htmlAttr.name }`);
		},
	};
	const collection = new RuleCollection();
	collection.push(cheapRule, expensiveRule);

	const { context, sourceFile } = prepareAnalyzer('const value = 1;');
	context.setContextBase({ file: sourceFile });
	const diagnostics = collection.getDiagnosticsFromDocument(
		parseHtml('<my-element first="one" second="two"></my-element>'),
		context,
	);

	t.is(diagnostics.length, 1);
	t.deepEqual(calls, [ 'cheap:first', 'cheap:second', 'expensive:second' ]);
});

tsTest('preserves diagnostic order when expensive rules are deferred', t => {
	const cheapRule: RuleModule = {
		id: 'no-invalid-directive-binding',
		visitHtmlAssignment(assignment, context) {
			if (assignment.htmlAttr.name === 'second') {
				context.report({
					location: { start: 0, end: 0 },
					message:  'Cheap diagnostic.',
				});
			}
		},
	};
	const expensiveRule: RuleModule = {
		id:   'no-incompatible-type-binding',
		meta: { phase: 'expensive' },
		visitHtmlAssignment(assignment, context) {
			context.report({
				location: { start: 0, end: 0 },
				message:  `Expensive ${ assignment.htmlAttr.name } diagnostic.`,
			});
		},
	};
	const collection = new RuleCollection();
	collection.push(cheapRule, expensiveRule);

	const { context, sourceFile } = prepareAnalyzer('const value = 1;');
	context.setContextBase({ file: sourceFile });
	const diagnostics = collection.getDiagnosticsFromDocument(
		parseHtml('<my-element first="one" second="two"></my-element>'),
		context,
	);

	t.deepEqual(diagnostics.map(diagnostic => diagnostic.diagnostic.message), [
		'Expensive first diagnostic.',
		'Cheap diagnostic.',
	]);
});
