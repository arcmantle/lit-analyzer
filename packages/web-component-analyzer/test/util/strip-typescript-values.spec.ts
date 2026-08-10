import { stripTypescriptValues } from '../../src/util/strip-typescript-values.js';
import { analyzeTextWithCurrentTsModule } from '../helpers/analyze-text-with-current-ts-module.js';
import { getCurrentTsModule, tsTest } from '../helpers/ts-test.js';

tsTest('formats Windows TypeScript paths with only the leaf filename', t => {
	const ts = getCurrentTsModule();
	const sourceFile = ts.createSourceFile('C:\\workspace\\component.ts', 'const value = 1;', ts.ScriptTarget.Latest, true);
	const { checker } = analyzeTextWithCurrentTsModule('');

	t.is(stripTypescriptValues(sourceFile, checker), '{SOURCEFILE:component.ts}');
	t.is(stripTypescriptValues(sourceFile.statements[0], checker), '{NODE:component.ts:0}');
});