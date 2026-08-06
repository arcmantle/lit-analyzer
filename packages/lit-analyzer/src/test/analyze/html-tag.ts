import { isVariableStatement, Type, TypeFlags } from 'typescript';

import { LIT_HTML_BOOLEAN_ATTRIBUTE_MODIFIER } from '../../lib/analyze/constants.js';
import { litAttributeModifierForTarget } from '../../lib/analyze/parse/parse-html-data/html-tag.js';
import { isBooleanType } from '../../lib/rules/util/type/type-utils.js';
import { compileFiles } from '../helpers/compile-files.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('treats a boolean union attribute as a boolean attribute', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const value: boolean | undefined;',
		entry:    true,
	});
	const declaration = (sourceFile.statements.find(isVariableStatement)!).declarationList.declarations[0];
	const type = program.getTypeChecker().getTypeAtLocation(declaration.name);

	t.is(litAttributeModifierForTarget({
		kind:    'attribute',
		name:    'value',
		getType: () => type,
	}, program.getTypeChecker()), LIT_HTML_BOOLEAN_ATTRIBUTE_MODIFIER);
});

tsTest('does not treat a never attribute as a boolean attribute', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const value: never;',
		entry:    true,
	});
	const declaration = (sourceFile.statements.find(isVariableStatement)!).declarationList.declarations[0];
	const type = program.getTypeChecker().getTypeAtLocation(declaration.name);

	t.is(litAttributeModifierForTarget({
		kind:    'attribute',
		name:    'value',
		getType: () => type,
	}, program.getTypeChecker()), '');
});

tsTest('matches any and unknown only when requested', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const anyValue: any;\ndeclare const unknownValue: unknown;',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const declarations = sourceFile.statements
		.filter(isVariableStatement)
		.map(statement => statement.declarationList.declarations[0]);
	const anyType = checker.getTypeAtLocation(declarations[0].name);
	const unknownType = checker.getTypeAtLocation(declarations[1].name);

	t.is(isBooleanType(anyType, checker), false);
	t.is(isBooleanType(unknownType, checker), false);
	t.is(isBooleanType(anyType, checker, { matchAny: true }), true);
	t.is(isBooleanType(unknownType, checker, { matchAny: true }), true);
});

tsTest('matches any inside an intersection when requested', t => {
	const { program } = compileFiles({
		fileName: 'source.ts',
		text:     '',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const intersection = {
		flags:          TypeFlags.Intersection,
		isUnion:        () => false,
		isIntersection: () => true,
		types:          [ checker.getAnyType(), checker.getBooleanType() ],
	} as unknown as Type;

	t.is(isBooleanType(intersection, checker), false);
	t.is(isBooleanType(intersection, checker, { matchAny: true }), true);
});
