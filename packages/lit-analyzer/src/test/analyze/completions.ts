import { completionsForHtmlAttrValues } from '../../lib/analyze/document-analyzer/html/completion/completions-for-html-attr-values.js';
import { HtmlDocument } from '../../lib/analyze/parse/document/text-document/html-document/html-document.js';
import { getPositionContextInDocument } from '../../lib/analyze/util/get-position-context-in-document.js';
import { prepareAnalyzer } from '../helpers/analyze.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('returns no options for a type reference without type arguments', t => {
	const { sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		entry:    true,
		text:     [
			'class Thing { }',
			'class MyElement extends HTMLElement {',
			'\tvalue!: Thing;',
			'}',
			'customElements.define("my-element", MyElement);',
			'html`<my-element value="">`;',
		].join('\n'),
	});

	const type = context.program.getTypeChecker().getTypeAtLocation(
		(sourceFile.statements[1] as import('typescript').ClassDeclaration).members[0],
	);
	const document = context.documentStore.getDocumentsInFile(sourceFile, context.config)
		.find((candidate): candidate is HtmlDocument => candidate instanceof HtmlDocument)!;
	const htmlNodeAttr = document.findAttr(attr => attr.name === 'value')!;
	const assignmentLocation = htmlNodeAttr.assignment?.location;
	if (assignmentLocation == null)
		throw new Error('Expected the value attribute to have an assignment location');

	const completionContext = Object.create(context) as typeof context;
	Object.defineProperty(completionContext, 'htmlStore', {
		value: { getHtmlAttrTarget: () => ({ kind: 'property', name: 'value', getType: () => type }) },
	});
	const completions = completionsForHtmlAttrValues(
		htmlNodeAttr,
		getPositionContextInDocument(document, assignmentLocation.end),
		completionContext,
	);

	t.deepEqual(completions, []);
});

tsTest('follows an alias target instead of its type argument', t => {
	const { sourceFile, context } = prepareAnalyzer({
		fileName: 'source.ts',
		entry:    true,
		text:     'type Foo<T> = T | "a";\nclass MyElement { value!: Foo<"x">; }\nhtml`<my-element value="">`;',
	});
	const type = context.program.getTypeChecker().getTypeAtLocation(
		(sourceFile.statements[1] as import('typescript').ClassDeclaration).members[0],
	);
	const document = context.documentStore.getDocumentsInFile(sourceFile, context.config)
		.find((candidate): candidate is HtmlDocument => candidate instanceof HtmlDocument)!;
	const htmlNodeAttr = document.findAttr(attr => attr.name === 'value')!;
	const assignmentLocation = htmlNodeAttr.assignment?.location;
	if (assignmentLocation == null)
		throw new Error('Expected the value attribute to have an assignment location');

	const completionContext = Object.create(context) as typeof context;
	Object.defineProperty(completionContext, 'htmlStore', {
		value: { getHtmlAttrTarget: () => ({ kind: 'property', name: 'value', getType: () => type }) },
	});
	const completions = completionsForHtmlAttrValues(
		htmlNodeAttr,
		getPositionContextInDocument(document, assignmentLocation.end),
		completionContext,
	);

	t.deepEqual(completions.map(completion => completion.name), [ 'a' ]);
});
