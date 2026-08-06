import { expect, test } from 'vitest';

import { analyzeTextWithCurrentTsModule } from '../helpers/analyze-text-with-current-ts-module.js';
import { transformAnalyzerResult } from '../../src/transformers/transform-analyzer-result.js';

test('emits a boolean literal as an explicit VS Code attribute value', () => {
	const { results, program } = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 */
		class MyElement extends HTMLElement {
			@property() myProp: true = true;
		}
		customElements.define('my-element', MyElement);
	`);

	const output = JSON.parse(transformAnalyzerResult('vscode', results, program));
	const attribute = output.tags[0].attributes.find(({ name }: { name: string }) => name === 'myProp');

	expect(attribute).toMatchObject({
		name:   'myProp',
		values: [ { name: 'true' } ],
	});
});

test('emits boolean literals in a union as explicit VS Code attribute values', () => {
	const { results, program } = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 */
		class MyElement extends HTMLElement {
			@property() myProp: true | 'no' = true;
		}
		customElements.define('my-element', MyElement);
	`);

	const output = JSON.parse(transformAnalyzerResult('vscode', results, program));
	const attribute = output.tags[0].attributes.find(({ name }: { name: string }) => name === 'myProp');

	expect(attribute).toMatchObject({
		name:   'myProp',
		values: [ { name: 'true' }, { name: 'no' } ],
	});
});