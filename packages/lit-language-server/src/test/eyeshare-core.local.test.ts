import * as fs from 'node:fs';
import path from 'node:path';

import { DefaultLitAnalyzerContext, LitAnalyzer, makeConfig } from '@arcmantle/lit-analyzer';
import * as ts from 'typescript';
import { expect, test } from 'vitest';
import { analyzeSourceFile } from '@arcmantle/web-component-analyzer';

import { createAnalysisCompiler } from '../analysis-compiler.js';

const eyeshareCoreDir = process.env.EYESHARE_CLIENT_FLEX_CORE
	?? '/Users/roen/Developer/Eyeshare/es-env-test/env1/eye-share/Workflow/ClientFlex/core';
const eyeshareCoreTsconfig = path.join(eyeshareCoreDir, 'src', 'tsconfig.json');
const eyeshareLinesComponent = path.join(eyeshareCoreDir, 'src', 'components', 'lines', 'lines.cmp.ts');
const eyeshareLineComponent = path.join(eyeshareCoreDir, 'src', 'components', 'lines', 'line.cmp.ts');
const eyeshareTest = fs.existsSync(eyeshareCoreTsconfig) && fs.existsSync(eyeshareLinesComponent)
	? test
	: test.skip;

eyeshareTest('resolves imports, definitions, and template tags in the Eyeshare ClientFlex core project', () => {
	const compiler = createAnalysisCompiler(eyeshareCoreTsconfig);
	const program = compiler.getProgram();
	const sourceFile = program.getSourceFile(eyeshareLinesComponent);
	expect(sourceFile).toBeDefined();

	const checker = program.getTypeChecker();
	const imports = new Map(
		sourceFile!.statements
			.filter(ts.isImportDeclaration)
			.map(declaration => [ declaration.moduleSpecifier.getText(sourceFile!).slice(1, -1), declaration.moduleSpecifier ]),
	);

	const frameworkSymbol = checker.getSymbolAtLocation(imports.get('@eye-share/flex-framework')!);
	expect(frameworkSymbol?.declarations?.[0].getSourceFile().fileName).toMatch(/@eye-share\/flex-framework\/dist\/lib\/index\.d\.ts$/);

	const paginatorSymbol = checker.getSymbolAtLocation(imports.get('../paginator/paginator.cmp.ts')!);
	expect(paginatorSymbol?.declarations?.[0].getSourceFile()
		.fileName).toBe(path.join(eyeshareCoreDir, 'src', 'components', 'paginator', 'paginator.cmp.ts'));

	const analysis = analyzeSourceFile(sourceFile!, {
		program,
		ts,
		config: {
			analyzeDependencies: true,
		},
	});
	expect(analysis.componentDefinitions.some(definition => definition.tagName === 'es-lines')).toBe(true);

	const context = new DefaultLitAnalyzerContext({ getProgram: () => compiler.getProgram() });
	context.updateConfig(makeConfig({
		rules: {
			'no-incompatible-property-type': 'error',
			'no-unknown-tag-name':           'error',
		},
	}));
	const diagnostics = new LitAnalyzer(context).getDiagnosticsInFile(sourceFile!);
	expect(
		diagnostics
			.filter(diagnostic => diagnostic.source === 'no-unknown-tag-name')
			.map(diagnostic => diagnostic.message),
	).toEqual([ 'Unknown tag <s-badge>.' ]);

	for (const tagName of [ 'es-checkbox', 'es-button', 'es-icon', 'es-line', 'es-paginator' ])
		expect(context.htmlStore.getHtmlTag(tagName), tagName).toBeDefined();

	const lineSourceFile = program.getSourceFile(eyeshareLineComponent);
	expect(lineSourceFile).toBeDefined();
	let lineDiagnostics = new LitAnalyzer(context).getDiagnosticsInFile(lineSourceFile!);
	expect(
		lineDiagnostics
			.filter(diagnostic => diagnostic.source === 'no-incompatible-type-binding')
			.map(diagnostic => diagnostic.message),
	).not.toContain("Type 'ActionDef[]' is not assignable to 'TAction[]'");
	expect(
		lineDiagnostics
			.filter(diagnostic => diagnostic.source === 'no-incompatible-property-type')
			.map(diagnostic => diagnostic.message),
	).not.toContain("@property type should be 'Array' instead of 'Object'");

	compiler.openDocument(eyeshareLinesComponent, `${ fs.readFileSync(eyeshareLinesComponent, 'utf8') }\n`);
	lineDiagnostics = new LitAnalyzer(context).getDiagnosticsInFile(compiler.getProgram().getSourceFile(eyeshareLineComponent)!);
	expect(
		lineDiagnostics
			.filter(diagnostic => diagnostic.source === 'no-incompatible-property-type')
			.map(diagnostic => diagnostic.message),
	).not.toContain("@property type should be 'Array' instead of 'Object'");

	const actionBar = context.htmlStore.getHtmlTag('es-action-bar');
	expect(actionBar).toBeDefined();
	expect(actionBar!.attributes.map(attribute => attribute.name)).toContain('shared-measurements');
	expect(actionBar!.attributes.map(attribute => attribute.name)).not.toContain('sharedMeasurements');
}, 30_000);
