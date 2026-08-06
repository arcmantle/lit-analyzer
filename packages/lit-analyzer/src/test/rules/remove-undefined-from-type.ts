import { isIdentifier, isVariableStatement } from 'typescript';

import { removeUndefinedFromType } from '../../lib/rules/util/type/remove-undefined-from-type.js';
import { compileFiles } from '../helpers/compile-files.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('removes undefined while preserving null', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const value: string | null | undefined;',
		entry:    true,
	});
	const declaration = sourceFile.statements
		.find(isVariableStatement)!
		.declarationList.declarations.find(node => isIdentifier(node.name))!;
	const checker = program.getTypeChecker();
	const type = removeUndefinedFromType(checker.getTypeAtLocation(declaration.name), checker);

	t.is(checker.typeToString(type), 'string | null');
});

tsTest('removes undefined without adding null', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const value: string | undefined;',
		entry:    true,
	});
	const declaration = sourceFile.statements
		.find(isVariableStatement)!
		.declarationList.declarations.find(node => isIdentifier(node.name))!;
	const checker = program.getTypeChecker();
	const type = removeUndefinedFromType(checker.getTypeAtLocation(declaration.name), checker);

	t.is(checker.typeToString(type), 'string');
});

tsTest('keeps null when it is the only non-undefined member', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const value: null | undefined;',
		entry:    true,
	});
	const declaration = sourceFile.statements
		.find(isVariableStatement)!
		.declarationList.declarations.find(node => isIdentifier(node.name))!;
	const checker = program.getTypeChecker();
	const type = removeUndefinedFromType(checker.getTypeAtLocation(declaration.name), checker);

	t.is(checker.typeToString(type), 'null');
});

tsTest('maps an undefined-only type to never', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'declare const value: undefined;',
		entry:    true,
	});
	const declaration = sourceFile.statements
		.find(isVariableStatement)!
		.declarationList.declarations.find(node => isIdentifier(node.name))!;
	const checker = program.getTypeChecker();
	const type = removeUndefinedFromType(checker.getTypeAtLocation(declaration.name), checker);

	t.is(checker.typeToString(type), 'never');
});