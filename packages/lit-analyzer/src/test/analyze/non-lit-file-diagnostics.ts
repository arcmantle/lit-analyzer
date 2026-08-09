import { expect, test } from 'vitest';

import { prepareAnalyzer } from '../helpers/analyze.js';

test('reports no diagnostics for a file without Lit templates', () => {
	const { analyzer, sourceFile } = prepareAnalyzer({
		fileName: 'plain-script.ts',
		text:     'export const answer = 42;',
	});

	const diagnostics = analyzer.getDiagnosticsInFile(sourceFile);

	expect(diagnostics).toEqual([]);
});
