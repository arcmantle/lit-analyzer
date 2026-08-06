import { isFunctionDeclaration, isIdentifier, isVariableStatement, Type, TypeChecker } from 'typescript';

import { RuleModuleContext } from '../../lib/analyze/types/rule/rule-module-context.js';
import { isAssignableToType } from '../../lib/rules/util/type/is-assignable-to-type.js';
import { compileFiles } from '../helpers/compile-files.js';
import { tsTest } from '../helpers/ts-test.js';

function typeOf(name: string, sourceFile: ReturnType<typeof compileFiles>['sourceFile'], checker: TypeChecker): Type {
	for (const statement of sourceFile.statements) {
		if (!isVariableStatement(statement))
			continue;

		for (const declaration of statement.declarationList.declarations) {
			if (isIdentifier(declaration.name) && declaration.name.text === name)
				return checker.getTypeAtLocation(declaration.name);
		}
	}

	throw new Error(`Could not find ${ name }`);
}

function parameterTypeOf(name: string, sourceFile: ReturnType<typeof compileFiles>['sourceFile'], checker: TypeChecker): Type {
	for (const statement of sourceFile.statements) {
		if (!isFunctionDeclaration(statement))
			continue;

		const parameter = statement.parameters.find(parameter => isIdentifier(parameter.name) && parameter.name.text === name);
		if (parameter != null)
			return checker.getTypeAtLocation(parameter);
	}

	throw new Error(`Could not find ${ name }`);
}

tsTest('uses checker assignability with target first and source second', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     `
			const source = 'value' as const;
			const target = '' as string;
		`,
		entry: true,
	});
	const checker = program.getTypeChecker();
	const context = { program, file: sourceFile } as RuleModuleContext;
	const source = typeOf('source', sourceFile, checker);
	const target = typeOf('target', sourceFile, checker);

	t.true(isAssignableToType({ typeA: target, typeB: source }, context));
	t.is(isAssignableToType({ typeA: source, typeB: target }, context), false);
});

tsTest('uses checker assignability for numeric literals', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'const source = 1; const target = 0 as number; const stringTarget = "" as string;',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const context = { program, file: sourceFile } as RuleModuleContext;
	const source = typeOf('source', sourceFile, checker);
	const target = typeOf('target', sourceFile, checker);
	const stringTarget = typeOf('stringTarget', sourceFile, checker);

	t.true(isAssignableToType({ typeA: target, typeB: source }, context));
	t.is(isAssignableToType({ typeA: stringTarget, typeB: source }, context), false);
});

tsTest('checks string literal assignability with checker types', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     "const source = 'value' as const; const target = '' as string;",
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const context = { program, file: sourceFile } as RuleModuleContext;
	const source = typeOf('source', sourceFile, checker);
	const target = typeOf('target', sourceFile, checker);

	t.true(isAssignableToType({ typeA: target, typeB: source }, context));
});

tsTest('allows a target intersection containing a free type parameter', t => {
	const { program, sourceFile } = compileFiles({
		fileName: 'source.ts',
		text:     'function render<T>(value: T & string) { return value; }',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const context = { program, file: sourceFile } as RuleModuleContext;
	const target = parameterTypeOf('value', sourceFile, checker);

	t.true(isAssignableToType({ typeA: target, typeB: checker.getStringType() }, context));
});
