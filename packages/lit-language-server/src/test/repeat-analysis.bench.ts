import * as path from 'node:path';

import { DefaultLitAnalyzerContext, LitAnalyzer, makeConfig } from '@arcmantle/lit-analyzer';
import { bench, describe } from 'vitest';

import { createAnalysisCompiler } from '../analysis-compiler.js';

const project = path.resolve(import.meta.dirname, 'fixtures/program-change-project');
const tsconfig = path.join(project, 'tsconfig.json');
const consumer = path.join(project, 'src/consumer.ts');

describe('repeat analysis', () => {
	const compiler = createAnalysisCompiler(tsconfig);

	const createAnalyzer = () => {
		const context = new DefaultLitAnalyzerContext({ getProgram: () => compiler.getProgram() });
		context.updateConfig(makeConfig({}));

		return new LitAnalyzer(context);
	};

	const cachedAnalyzer = createAnalyzer();
	cachedAnalyzer.getDiagnosticsInFile(compiler.getProgram().getSourceFile(consumer)!);

	bench('reuse a warmed analyzer context', () => {
		cachedAnalyzer.getDiagnosticsInFile(compiler.getProgram().getSourceFile(consumer)!);
	});

	bench('analyze with a fresh context', () => {
		createAnalyzer().getDiagnosticsInFile(compiler.getProgram().getSourceFile(consumer)!);
	});
});
