import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { DefaultLitAnalyzerContext, LitAnalyzer, makeConfig } from '@arcmantle/lit-analyzer';
import { expect, test } from 'vitest';

import { createAnalysisCompiler } from '../analysis-compiler.js';

const PROJECT = path.resolve(import.meta.dirname, 'fixtures/program-change-project');
const TSCONFIG = path.join(PROJECT, 'tsconfig.json');
const CONSUMER = path.join(PROJECT, 'src/consumer.ts');
const BASE = path.join(PROJECT, 'src/base.ts');
const ELEMENT = path.join(PROJECT, 'src/element.ts');
const VALUE_TYPE = path.join(PROJECT, 'src/value-type.ts');

/**
 * Counts the component member nodes that no longer belong to the given program.
 * A checker read is valid only on a node of a source file the program still owns.
 */
function countDeadNodes(context: DefaultLitAnalyzerContext, tagName: string): number {
	let dead = 0;

	for (const property of context.htmlStore.getAllPropertiesForTag(tagName)) {
		const node = property.declaration?.node;
		if (node == null)
			continue;


		const sourceFile = node.getSourceFile();
		if (context.program.getSourceFile(sourceFile.fileName) !== sourceFile)
			dead += 1;
	}

	return dead;
}

test('A component member node belongs to the current program after the program changes', () => {
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
	expect(countDeadNodes(context, 'my-element')).toBe(0);

	// Opening and closing a document makes the language service build a new program.
	compiler.openDocument(CONSUMER, readFileSync(CONSUMER, 'utf8'));
	analyze();
	compiler.closeDocument(CONSUMER);
	analyze();

	expect(countDeadNodes(context, 'my-element')).toBe(0);
});

test('A component member type comes from the checker the caller gives it', () => {
	const compiler = createAnalysisCompiler(TSCONFIG);
	const context = new DefaultLitAnalyzerContext({ getProgram: () => compiler.getProgram() });
	context.updateConfig(makeConfig({}));
	const analyzer = new LitAnalyzer(context);

	analyzer.getDiagnosticsInFile(compiler.getProgram().getSourceFile(CONSUMER)!);

	const property = Array.from(context.htmlStore.getAllPropertiesForTag('my-element'))
		.find(candidate => candidate.name === 'value')!;
	const member = property.declaration!;

	// Editing the consumer makes a new program. The element file is untouched, so its nodes stay live.
	compiler.openDocument(CONSUMER, `${ readFileSync(CONSUMER, 'utf8') }\n`);
	const checker = compiler.getProgram().getTypeChecker();

	expect(member.type!(checker)).toBe(checker.getTypeAtLocation(member.node));
});

test('A Lit property converter type remains valid after the program changes', () => {
	const compiler = createAnalysisCompiler(TSCONFIG);
	const context = new DefaultLitAnalyzerContext({ getProgram: () => compiler.getProgram() });
	context.updateConfig(makeConfig({ rules: { 'no-incompatible-property-type': 'error' } }));
	const analyzer = new LitAnalyzer(context);

	const converterMessages = () => analyzer
		.getDiagnosticsInFile(compiler.getProgram().getSourceFile(ELEMENT)!)
		.filter(diagnostic => diagnostic.source === 'no-incompatible-property-type')
		.map(diagnostic => diagnostic.message);

	expect(converterMessages()).not.toContain("@property type should be 'Array' instead of 'Object'");

	compiler.openDocument(CONSUMER, `${ readFileSync(CONSUMER, 'utf8') }\n`);

	expect(converterMessages()).not.toContain("@property type should be 'Array' instead of 'Object'");
});

/** Builds an analyzed project and counts how often a tag is rebuilt after the first analysis. */
function startProject() {
	const compiler = createAnalysisCompiler(TSCONFIG);
	const context = new DefaultLitAnalyzerContext({ getProgram: () => compiler.getProgram() });
	context.updateConfig(makeConfig({}));
	const analyzer = new LitAnalyzer(context);

	const analyze = () => analyzer.getDiagnosticsInFile(compiler.getProgram().getSourceFile(CONSUMER)!);
	analyze();

	let rebuilds = 0;
	const debug = context.logger.debug.bind(context.logger);
	context.logger.debug = (...args: unknown[]) => {
		if (String(args[0]).includes(ELEMENT))
			rebuilds += 1;


		debug(...args);
	};

	const typeKindOf = (propertyName: string) => {
		const property = Array.from(context.htmlStore.getAllPropertiesForTag('my-element'))
			.find(candidate => candidate.name === propertyName)!;

		const checker = compiler.getProgram().getTypeChecker();

		return checker.typeToString(property.getType(checker));
	};

	return { compiler, analyze, typeKindOf, rebuildCount: () => rebuilds };
}

test('A change to a base class file rebuilds the component', () => {
	const project = startProject();

	expect(project.typeKindOf('label')).toBe('string');

	project.compiler.openDocument(BASE, 'export class BaseElement extends HTMLElement {\n\tlabel: number = 0;\n}\n');
	project.analyze();

	expect(project.rebuildCount()).toBe(1);
	expect(project.typeKindOf('label')).toBe('number');
});

test('A change to a file the component only takes a type from does not rebuild it', () => {
	const project = startProject();

	expect(project.typeKindOf('value')).toBe('string');

	project.compiler.openDocument(VALUE_TYPE, 'export type Value = number;\n');
	project.analyze();

	expect(project.rebuildCount()).toBe(0);
	expect(project.typeKindOf('value')).toBe('number');
});
