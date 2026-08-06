import { isCallExpression, isExpressionStatement, isIdentifier, isVariableStatement, TypeFlags } from 'typescript';

import { HtmlNodeAttrAssignment, HtmlNodeAttrAssignmentKind } from '../../lib/analyze/types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttrKind } from '../../lib/analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../lib/analyze/types/rule/rule-module-context.js';
import { extractBindingTypes, inferTypeFromAssignment } from '../../lib/rules/util/type/extract-binding-types.js';
import { compileFiles } from '../helpers/compile-files.js';
import { getCurrentTsModule, tsTest } from '../helpers/ts-test.js';

tsTest('infers a static string assignment as a TypeScript string literal type', t => {
	const { program } = compileFiles({
		fileName: 'source.ts',
		text:     'const value = "hello";',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const type = inferTypeFromAssignment({
		kind:     HtmlNodeAttrAssignmentKind.STRING,
		value:    'hello',
		htmlAttr: undefined as never,
		location: undefined as never,
	}, checker);

	t.true((type.flags & TypeFlags.StringLiteral) !== 0);
	t.is(checker.typeToString(type), '"hello"');
});

tsTest('infers a bare boolean assignment as true', t => {
	const { program } = compileFiles({
		fileName: 'source.ts',
		text:     '',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const type = inferTypeFromAssignment({
		kind:     HtmlNodeAttrAssignmentKind.BOOLEAN,
		htmlAttr: undefined as never,
	}, checker);

	t.is(checker.typeToString(type), 'true');
});

tsTest('infers an expression assignment from the checker', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'const value = 42;',
		entry:    true,
	});
	const statement = sourceFile.statements.find(isVariableStatement)!;
	const declaration = statement.declarationList.declarations.find(node => isIdentifier(node.name))!;
	const type = inferTypeFromAssignment({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		htmlAttr:   undefined as never,
		expression: declaration.initializer!,
		location:   undefined as never,
	}, program.getTypeChecker());

	t.is(program.getTypeChecker().typeToString(type), '42');
});

tsTest('infers a non-event mixed assignment as string', t => {
	const { program } = compileFiles({
		fileName: 'source.ts',
		text:     '',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const type = inferTypeFromAssignment({
		kind:     HtmlNodeAttrAssignmentKind.MIXED,
		htmlAttr: { kind: HtmlNodeAttrKind.ATTRIBUTE } as never,
		location: undefined as never,
		values:   [],
	}, checker);

	t.is(checker.typeToString(type), 'string');
});

tsTest('infers an event mixed assignment from its first expression', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'const value = 42;',
		entry:    true,
	});
	const statement = sourceFile.statements.find(isVariableStatement)!;
	const expression = statement.declarationList.declarations[0].initializer!;
	const checker = program.getTypeChecker();
	const type = inferTypeFromAssignment({
		kind:     HtmlNodeAttrAssignmentKind.MIXED,
		htmlAttr: { kind: HtmlNodeAttrKind.EVENT_LISTENER } as never,
		location: undefined as never,
		values:   [ 'prefix', expression ],
	}, checker);

	t.is(checker.typeToString(type), '42');
});

tsTest('uses any when an assignment has no target', t => {
	const { program } = compileFiles({
		fileName: 'source.ts',
		text:     '',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const result = extractBindingTypes({
		kind:     HtmlNodeAttrAssignmentKind.STRING,
		value:    'hello',
		htmlAttr: undefined as never,
		location: undefined as never,
	}, {
		program,
		htmlStore: { getHtmlAttrTarget: () => undefined },
	} as unknown as RuleModuleContext);

	t.is(checker.typeToString(result.typeA), 'any');
});

tsTest('uses a directive argument type when a directive overrides the assignment', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'const value = 42; live(value);',
		entry:    true,
	});
	const call = sourceFile.statements
		.filter(isExpressionStatement)
		.map(statement => statement.expression)
		.find(isCallExpression)!;
	const checker = program.getTypeChecker();
	const result = extractBindingTypes({
		kind:       HtmlNodeAttrAssignmentKind.EXPRESSION,
		htmlAttr:   undefined as never,
		location:   undefined as never,
		expression: call,
	}, {
		program,
		ts:        getCurrentTsModule(),
		htmlStore: { getHtmlAttrTarget: () => undefined },
	} as unknown as RuleModuleContext);

	t.is(checker.typeToString(result.typeB), '42');
});

tsTest('recomputes binding types for a new Program', t => {
	const assignment: HtmlNodeAttrAssignment = {
		kind:     HtmlNodeAttrAssignmentKind.STRING,
		value:    'hello',
		htmlAttr: undefined as never,
		location: undefined as never,
	};
	const first = compileFiles({ fileName: 'first.ts', text: '', entry: true });
	const second = compileFiles({ fileName: 'second.ts', text: '', entry: true });
	const firstResult = extractBindingTypes(assignment, {
		program:   first.program,
		htmlStore: { getHtmlAttrTarget: () => undefined },
	} as unknown as RuleModuleContext);
	const secondResult = extractBindingTypes(assignment, {
		program:   second.program,
		htmlStore: { getHtmlAttrTarget: () => undefined },
	} as unknown as RuleModuleContext);

	t.true(firstResult.typeB !== secondResult.typeB);
});
