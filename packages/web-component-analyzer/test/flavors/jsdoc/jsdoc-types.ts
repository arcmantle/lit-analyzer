import { isTypeAliasDeclaration } from "typescript";

import { analyzeTextWithCurrentTsModule } from "../../helpers/analyze-text-with-current-ts-module.js";
import { tsTest } from "../../helpers/ts-test.js";

tsTest("jsdoc: analyzeText includes recovered JSDoc resolver files in its Program", t => {
	const {
		results: [result],
		program,
		analyzedSourceFiles,
	} = analyzeTextWithCurrentTsModule(`
	/**
	 * @element
	 * @fires {Array} changed
	 */
	class MyElement extends HTMLElement {}
	`);

	const resolverFile = program.getSourceFile(`${ analyzedSourceFiles[0]!.fileName }.__lit_jsdoc__.d.ts`);

	t.truthy(resolverFile);
	t.is(analyzedSourceFiles.length, 1);
	t.is(result.sourceFile, analyzedSourceFiles[0]);
});

tsTest("Parse required and union through the active Program", t => {
	const { results: [result], program } = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 * @fires {!Array|undefined} changed
		 */
		class MyElement extends HTMLElement {}
		type Expected = any[] | undefined;
	`);
	const checker = program.getTypeChecker();
	const type = result.componentDefinitions[0]!.declaration!.events[0]!.type!(checker);
	const expectedAlias = result.sourceFile.statements.find(isTypeAliasDeclaration)!;
	const expected = checker.getTypeAtLocation(expectedAlias.type);

	t.true(checker.isTypeAssignableTo(type, expected));
});
