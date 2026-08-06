import { Program } from 'typescript';
import { expect, test } from 'vitest';

import { DefaultLitAnalyzerContext } from '../../lib/analyze/default-lit-analyzer-context.js';
import { LitAnalyzer } from '../../lib/analyze/lit-analyzer.js';
import { makeConfig } from '../../lib/analyze/lit-analyzer-config.js';
import { compileFiles } from '../helpers/compile-files.js';
import { getCurrentTsModule } from '../helpers/ts-test.js';

const CONSUMER = {
	fileName: 'consumer.ts',
	entry:    true,
	text:     `
		import './element.js';
		declare function html(strings: TemplateStringsArray, ...values: unknown[]): unknown;
		export function render(value: string): unknown {
			return html\`<my-element .value=\${ value }></my-element>\`;
		}
	`,
};

const ELEMENT = {
	fileName: 'element.ts',
	text:     `
		export class MyElement extends HTMLElement {
			value: string = '';
		}
		customElements.define('my-element', MyElement);
		declare global {
			interface HTMLElementTagNameMap {
				'my-element': MyElement;
			}
		}
	`,
};

const OTHER = {
	fileName: 'other.ts',
	text:     `
		export class OtherElement extends HTMLElement {
			label: string = '';
		}
		customElements.define('other-element', OtherElement);
		declare global {
			interface HTMLElementTagNameMap {
				'other-element': OtherElement;
			}
		}
	`,
};

/**
 * Analyzes a project, then swaps in a program built without `element.ts`. That is what a
 * long-lived context sees when a file is deleted: the same context, a program that no
 * longer owns the file.
 */
function startProjectThenDropElement(withOther = false) {
	const before = compileFiles(withOther ? [ CONSUMER, ELEMENT, OTHER ] : [ CONSUMER, ELEMENT ]);
	let program = before.program;

	const context = new DefaultLitAnalyzerContext({
		ts:         getCurrentTsModule(),
		getProgram: (): Program => program,
	});
	context.updateConfig(makeConfig({}));
	const analyzer = new LitAnalyzer(context);

	analyzer.getDiagnosticsInFile(before.sourceFile);

	const dropElement = () => {
		const after = compileFiles(withOther ? [ CONSUMER, OTHER ] : [ CONSUMER ]);
		program = after.program;
		analyzer.getDiagnosticsInFile(after.sourceFile);
	};

	return { context, dropElement };
}

test('A component whose file left the program is no longer offered', () => {
	const { context, dropElement } = startProjectThenDropElement();

	expect(context.htmlStore.getHtmlTag('my-element')).toBeDefined();

	dropElement();

	expect(context.htmlStore.getHtmlTag('my-element')).toBeUndefined();
});

test('No member of a component whose file left the program survives', () => {
	const { context, dropElement } = startProjectThenDropElement();

	expect(Array.from(context.htmlStore.getAllPropertiesForTag('my-element')).map(p => p.name)).toContain('value');

	dropElement();

	// The global members apply to any tag name, so only the component's own member goes.
	expect(Array.from(context.htmlStore.getAllPropertiesForTag('my-element')).map(p => p.name)).not.toContain('value');
});

test('A component in a file that stayed keeps working after another file left the program', () => {
	const { context, dropElement } = startProjectThenDropElement(true);

	dropElement();

	const property = Array.from(context.htmlStore.getAllPropertiesForTag('other-element'))
		.find(candidate => candidate.name === 'label');

	expect(property).toBeDefined();

	// A read on a dead node gives a wrong type or throws, so this covers both.
	const node = property!.declaration!.node;
	expect(context.program.getSourceFile(node.getSourceFile().fileName)).toBe(node.getSourceFile());
	const checker = context.program.getTypeChecker();
	expect(checker.typeToString(property!.getType(checker))).toBe('string');
});
