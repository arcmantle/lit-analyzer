import { join } from 'node:path';

import { expect, test } from 'vitest';

import { transformAnalyzerResult } from '../../src/transformers/transform-analyzer-result.js';
import { analyzeTextWithCurrentTsModule } from '../helpers/analyze-text-with-current-ts-module.js';

test('emits portable source paths', () => {
	const workspace = join('workspace', 'project');
	const fileName = join(workspace, 'src', 'my-element.ts');
	const { results, program } = analyzeTextWithCurrentTsModule({
		fileName,
		text: `
			class MyElement extends HTMLElement {}
			customElements.define('my-element', MyElement);
		`,
	});

	const output = JSON.parse(transformAnalyzerResult('json', results, program, { cwd: workspace }));
	const json2Output = JSON.parse(transformAnalyzerResult('json2', results, program, { cwd: workspace }));

	expect(output.tags[0].path).toBe('./src/my-element.ts');
	expect(json2Output.modules[0].path).toBe('./src/my-element.ts');
});