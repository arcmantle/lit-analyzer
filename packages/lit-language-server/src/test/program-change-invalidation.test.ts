import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { DefaultLitAnalyzerContext, LitAnalyzer, makeConfig } from 'lit-analyzer';
import { expect, test } from 'vitest';

import { createAnalysisCompiler } from '../analysis-compiler.js';

const PROJECT = path.resolve(import.meta.dirname, 'fixtures/program-change-project');
const TSCONFIG = path.join(PROJECT, 'tsconfig.json');
const CONSUMER = path.join(PROJECT, 'src/consumer.ts');

/**
 * Counts the component member types that no longer belong to the given program.
 * A member type from an earlier program keeps that whole program alive.
 */
function countStaleMemberTypes(context: DefaultLitAnalyzerContext, tagName: string): number {
	const checker = context.program.getTypeChecker();
	let stale = 0;

	for (const property of context.htmlStore.getAllPropertiesForTag(tagName)) {
		const declaration = property.declaration;
		if (declaration?.type == null)
			continue;


		if (declaration.type() !== checker.getTypeAtLocation(declaration.node))
			stale += 1;
	}

	return stale;
}

test('A component member type belongs to the current program after the program changes', () => {
	const compiler = createAnalysisCompiler(TSCONFIG);
	const context = new DefaultLitAnalyzerContext({ getProgram: () => compiler.getProgram() });
	context.updateConfig(makeConfig({}));
	const analyzer = new LitAnalyzer(context);

	const analyze = () => analyzer.getDiagnosticsInFile(compiler.getProgram().getSourceFile(CONSUMER)!);

	analyze();
	// `label` comes from a base class in another file, so the count covers inherited members too.
	const names = Array.from(context.htmlStore.getAllPropertiesForTag('my-element')).map(property => property.name);
	expect(names).toContain('value');
	expect(names).toContain('label');
	expect(countStaleMemberTypes(context, 'my-element')).toBe(0);

	// Opening and closing a document makes the language service build a new program.
	compiler.openDocument(CONSUMER, readFileSync(CONSUMER, 'utf8'));
	analyze();
	compiler.closeDocument(CONSUMER);
	analyze();

	expect(countStaleMemberTypes(context, 'my-element')).toBe(0);
});
