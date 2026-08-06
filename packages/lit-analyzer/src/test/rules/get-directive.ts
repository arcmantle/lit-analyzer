import * as ts from 'typescript';
import { Type } from 'typescript';

import { HtmlNodeAttrAssignmentKind } from '../../lib/analyze/types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttr } from '../../lib/analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../lib/analyze/types/rule/rule-module-context.js';
import { getDirective } from '../../lib/rules/util/directive/get-directive.js';
import { prepareAnalyzer } from '../helpers/analyze.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('live directives expose the checker type of their argument', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			declare const live: (value: unknown) => unknown;
			const value = 1;
			live(value);
		`,
		entry: true,
	});
	const call = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.find(ts.isCallExpression)!;
	const directive = getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext);

	t.is(directive?.actualType?.(), program.getTypeChecker().getTypeAtLocation(call.arguments[0]));
});

tsTest('live directive types are resolved lazily', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			declare const live: (value: unknown) => unknown;
			const value = 1;
			live(value);
		`,
		entry: true,
	});
	const call = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.find(ts.isCallExpression)!;
	const directive = getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext);

	t.is(typeof directive?.actualType, 'function');
	t.is(program.getTypeChecker().typeToString(directive?.actualType?.() as Type), '1');
});

tsTest('ifDefined removes undefined while preserving null', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			declare const ifDefined: (value: string | null | undefined) => unknown;
			declare const value: string | null | undefined;
			ifDefined(value);
		`,
		entry: true,
	});
	const call = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.find(ts.isCallExpression)!;
	const directive = getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext);
	const actualType = directive?.actualType?.();

	t.is(program.getTypeChecker().typeToString(actualType as Type), 'string | null');
});

tsTest('classMap and styleMap expose checker string types', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			declare const classMap: (value: unknown) => unknown;
			declare const styleMap: (value: unknown) => unknown;
			classMap({});
			styleMap({});
		`,
		entry: true,
	});
	const calls = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.filter(ts.isCallExpression);
	const actualTypes = calls.map(call => getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext)?.actualType?.());

	t.is(actualTypes.map(type => program.getTypeChecker().typeToString(type as Type)).join(','), 'string,string');
});

tsTest('generic user directives expose their checker type argument', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			interface Part { }
			type DirectiveFn<T = unknown> = (part: Part) => void;
			declare const directive: <T>(value: T) => DirectiveFn<T>;
			declare const value: number;
			directive(value);
		`,
		entry: true,
	});
	const call = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.find(ts.isCallExpression)!;
	const directive = getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext);

	t.is(program.getTypeChecker().typeToString(directive?.actualType?.() as Type), 'number');
});

tsTest('aliased generic user directives expose their checker type argument', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			interface Part { }
			type DirectiveFn<T = unknown> = (part: Part) => void;
			type MyDirective<T> = DirectiveFn<T>;
			declare const directive: <T>(value: T) => MyDirective<T>;
			declare const value: number;
			directive(value);
		`,
		entry: true,
	});
	const call = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.find(ts.isCallExpression)!;
	const directive = getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext);

	t.is(program.getTypeChecker().typeToString(directive?.actualType?.() as Type), 'number');
});

tsTest('guard exposes the checker return type of its callback', t => {
	const { program, sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		text:     `
			declare const guard: (keys: unknown[], value: () => unknown) => unknown;
			declare const value: number;
			guard([], () => value);
		`,
		entry: true,
	});
	const call = sourceFile.statements
		.filter(ts.isExpressionStatement)
		.map(statement => statement.expression)
		.find(ts.isCallExpression)!;
	const directive = getDirective({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		expression: call,
		htmlAttr:   {} as HtmlNodeAttr,
		location:   { start: 0, end: 0 },
	}, context as unknown as RuleModuleContext);

	t.is(program.getTypeChecker().typeToString(directive?.actualType?.() as Type), 'number');
});
