import { Type } from 'typescript';

import { RuleModuleContext } from '../../lib/analyze/types/rule/rule-module-context.js';
import { isAssignableInBooleanBinding } from '../../lib/rules/util/type/is-assignable-in-boolean-binding.js';
import { prepareAnalyzer } from '../helpers/analyze.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('accepts checker types for a valid boolean binding', t => {
	const { context, program, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     'const value = true;',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const diagnostics: unknown[] = [];
	const htmlAttr = {
		document: { virtualDocument: { documentOffsetToSFPosition: (offset: number) => offset } },
		location: { name: { start: 0, end: 1 } },
	} as never;
	const ruleContext = {
		...context,
		program,
		file: sourceFile,
		report(diagnostic: unknown) {
			diagnostics.push(diagnostic);
		},
	} as unknown as RuleModuleContext;

	isAssignableInBooleanBinding(
		htmlAttr,
		{ typeA: checker.getBooleanType() as Type, typeB: checker.getTrueType() as Type },
		ruleContext,
	);

	t.is(diagnostics.length, 0);
});

tsTest('reports a checker type that is not valid for a boolean binding', t => {
	const { context, program, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     'const value = "text";',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const diagnostics: { message: string; }[] = [];
	const htmlAttr = {
		document: { virtualDocument: { documentOffsetToSFPosition: (offset: number) => offset } },
		location: { name: { start: 0, end: 1 } },
	} as never;
	const ruleContext = {
		...context,
		program,
		file: sourceFile,
		report(diagnostic: { message: string; }) {
			diagnostics.push(diagnostic);
		},
	} as unknown as RuleModuleContext;

	isAssignableInBooleanBinding(
		htmlAttr,
		{ typeA: checker.getBooleanType() as Type, typeB: checker.getStringType() as Type },
		ruleContext,
	);

	t.is(diagnostics.length, 1);
	t.is(diagnostics[0].message, "Type 'string' is not assignable to 'boolean'");
});

tsTest('reports a boolean binding whose checker target is not boolean', t => {
	const { context, program, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     'const value = true;',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const diagnostics: { message: string; }[] = [];
	const htmlAttr = {
		document: { virtualDocument: { documentOffsetToSFPosition: (offset: number) => offset } },
		location: { name: { start: 0, end: 1 } },
	} as never;
	const ruleContext = {
		...context,
		program,
		file: sourceFile,
		report(diagnostic: { message: string; }) {
			diagnostics.push(diagnostic);
		},
	} as unknown as RuleModuleContext;

	isAssignableInBooleanBinding(
		htmlAttr,
		{ typeA: checker.getStringType() as Type, typeB: checker.getBooleanType() as Type },
		ruleContext,
	);

	t.is(diagnostics.length, 1);
	t.is(diagnostics[0].message, "You are using a boolean binding on a non boolean type 'string'");
});
