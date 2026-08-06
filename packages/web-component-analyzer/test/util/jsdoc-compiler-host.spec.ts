import { TypeFlags } from 'typescript';

import { analyzeText } from '../../src/analyze/analyze-text.js';
import { hasJSDocResolverDiagnostic } from '../../src/analyze/util/jsdoc-compiler-host.js';
import { getCurrentTsModule, tsTest } from '../helpers/ts-test.js';

tsTest('recovered JSDoc types resolve through an in-memory declaration file', t => {
	const ts = getCurrentTsModule();
	const { program } = analyzeText({
		fileName:   'component.ts',
		includeLib: true,
		text: `
		/**
		 * @element
		 * @fires {CustomEvent<Array>} items-changed
		 */
		class Component extends HTMLElement {}
		`,
	}, { ts });

	const resolverFile = program.getSourceFile('component.ts.__lit_jsdoc__.d.ts');
	t.truthy(resolverFile);

	const alias = resolverFile?.statements.find(statement => ts.isTypeAliasDeclaration(statement));
	t.truthy(alias);
	t.true(alias!.name.text.startsWith('__lit_jsdoc_'));

	const type = program.getTypeChecker().getTypeAtLocation(alias!.type);
	t.truthy(type.flags & TypeFlags.Object);
});

tsTest('recovered JSDoc resolver files copy imports and stay module-local', t => {
	const ts = getCurrentTsModule();
	const { program } = analyzeText([
		{
			fileName: 'detail.ts',
			text:     'export interface Detail { value: string; }',
		},
		{
			fileName:   'component.ts',
			includeLib: true,
			text: `
			import type { Detail } from './detail.js';

			/**
			 * @element
			 * @fires {CustomEvent<Detail>} changed
			 */
			class Component extends HTMLElement {}
			`,
		},
	], { ts });

	const resolverFile = program.getSourceFile('component.ts.__lit_jsdoc__.d.ts');
	t.truthy(resolverFile);
	t.true(resolverFile!.text.startsWith('export {};'));
	t.true(resolverFile!.text.includes("import type { Detail } from './detail.js';"));

	const alias = resolverFile!.statements.find(statement => ts.isTypeAliasDeclaration(statement));
	t.truthy(alias);
	t.true(alias!.name.text.startsWith('__lit_jsdoc_'));
	const checker = program.getTypeChecker();
	const aliasType = checker.getTypeAtLocation(alias!.type);
	const detailType = checker.getTypeOfSymbolAtLocation(checker.getPropertyOfType(aliasType, 'detail')!, alias!.type);
	t.truthy(checker.getPropertyOfType(detailType, 'value'));
	t.is(checker.getSymbolsInScope(program.getSourceFile('component.ts')!, ts.SymbolFlags.Type).some(symbol => symbol.name.startsWith('__lit_jsdoc_')), false);
});

tsTest('unresolved recovered JSDoc aliases are reported internally', t => {
	const ts = getCurrentTsModule();
	const { program } = analyzeText({
		fileName:   'component.ts',
		includeLib: true,
		text: `
		/**
		 * @element
		 * @fires {MissingType} error
		 */
		class Component extends HTMLElement {}
		`,
	}, { ts });

	const resolverFile = program.getSourceFile('component.ts.__lit_jsdoc__.d.ts')!;
	const alias = resolverFile.statements.find(statement => ts.isTypeAliasDeclaration(statement))!;
	t.true(hasJSDocResolverDiagnostic(program, resolverFile, alias.type));
});

tsTest('a reserved resolver filename is never shadowed', t => {
	const ts = getCurrentTsModule();
	const { program } = analyzeText([
		{
			fileName:   'component.ts',
			includeLib: true,
			text: `
			/** @element @fires {Array} items-changed */
			class Component extends HTMLElement {}
			`,
		},
		{
			fileName: 'component.ts.__lit_jsdoc__.d.ts',
			text:     'export {};',
		},
	], { ts });

	t.is(program.getSourceFile('component.ts.__lit_jsdoc__.d.ts')!.text, 'export {};');
});

tsTest('compiler-owned JSDoc type nodes do not create resolver files', t => {
	const ts = getCurrentTsModule();
	const { program } = analyzeText({
		fileName: 'component.ts',
		text: `
		/** @type {string} */
		const value = '';
		`,
	}, { ts });

	t.is(program.getSourceFile('component.ts.__lit_jsdoc__.d.ts'), undefined);
});

tsTest('ambiguous recovered union identifiers use the active Program classification', t => {
	const ts = getCurrentTsModule();
	const { program } = analyzeText({
		fileName:   'component.ts',
		includeLib: true,
		text: `
		/** @element @fires {Event|auto} changed */
		class Component extends HTMLElement {}
		`,
	}, { ts });

	const resolverFile = program.getSourceFile('component.ts.__lit_jsdoc__.d.ts')!;
	const alias = resolverFile.statements.find(statement => ts.isTypeAliasDeclaration(statement))!;
	const checker = program.getTypeChecker();
	const type = checker.getTypeAtLocation(alias.type);
	const unionTypes = type.isUnion() ? type.types : [];

	t.is(unionTypes.length, 2);
	t.true(unionTypes.some(member => member.symbol?.name === 'Event'));
	t.true(unionTypes.some(member => (member.flags & ts.TypeFlags.StringLiteral) !== 0 && (member as ts.StringLiteralType).value === 'auto'));
});