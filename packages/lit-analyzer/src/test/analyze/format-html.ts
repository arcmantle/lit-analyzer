import { LitHtmlVscodeService } from '../../lib/analyze/document-analyzer/html/lit-html-vscode-service.js';
import { LitAnalyzerFormatConfig } from '../../lib/analyze/lit-analyzer-config.js';
import { prepareAnalyzer } from '../helpers/analyze.js';
import { parseHtml } from '../helpers/parse-html.js';
import { tsTest } from '../helpers/ts-test.js';

const enabledBindingFormatters: LitAnalyzerFormatConfig = {
	disable:                 false,
	groupBindings:           true,
	newLineBindings:         true,
	newLineTemplate:         false,
	alignBindingAssignments: true,
};

tsTest('puts template content on its own lines', t => {
	const document = parseHtml('<my-element></my-element>');
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, {
		...enabledBindingFormatters,
		newLineTemplate: true,
	});

	t.is(edits.length, 1);
	t.is(edits[0].newText, '\n<my-element></my-element>\n');
});

tsTest('aligns root template content with the template start', t => {
	const document = parseHtml('\n    <my-element></my-element>\n');
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, {
		...enabledBindingFormatters,
		newLineTemplate: true,
	});

	t.is(edits.length, 1);
	t.is(edits[0].newText, '\n<my-element></my-element>\n');
});

tsTest('aligns template content with a return statement', t => {
	const { analyzer, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		entry:    true,
		text:     [
			'declare const html: any;',
			'class Element {',
			'\trender() {',
			'\t\treturn html`',
			'\t\t<my-element first="first" .second=${ second }></my-element>',
			'\t\t`;',
			'\t}',
			'}',
		].join('\n'),
	});
	const edits = analyzer.getFormatEditsInFile(sourceFile, { tabSize: 2, convertTabsToSpaces: true });

	t.is(edits.length, 1);
	t.true(edits[0].newText.startsWith('\n\t\t<my-element'));
	t.true(edits[0].newText.endsWith('</my-element>\n\t\t'));
});

tsTest('normalizes multiline expression indentation at a template root', t => {
	const { analyzer, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		entry:    true,
		text:     [
			'declare const html: any;',
			'declare const when: any;',
			'class Element {',
			'\trender(index: number) {',
			'\t\treturn html`',
			'\t\t\t\t${ when(',
			'\t\t\t\t\tindex !== 0 && this.linesControl.separator,',
			'\t\t\t\t\t() => this.linesControl.separator!(),',
			'\t\t\t\t) }',
			'\t\t`;',
			'\t}',
			'}',
		].join('\n'),
	});
	const edits = analyzer.getFormatEditsInFile(sourceFile, { tabSize: 2, convertTabsToSpaces: true });

	t.is(edits.length, 1);
	t.true(edits[0].newText.includes('\n\t\t\tindex !== 0 && this.linesControl.separator,'));
	t.true(edits[0].newText.includes('\n\t\t)}\n\t\t'));
});

tsTest('groups, wraps, and aligns Lit bindings', t => {
	const document = parseHtml(
		'<my-element '
		+ '@change="onChange" attribute="value" .longProperty="property" ?enabled="true" .short="short" @click="onClick"'
		+ '></my-element>',
	);
	const edits = new LitHtmlVscodeService()
		.format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits.length, 1);
	t.is(edits[0].newText, [
		'<my-element',
		'  attribute    ="value"',
		'  .longProperty="property"',
		'  .short       ="short"',
		'  ?enabled     ="true"',
		'  @change      ="onChange"',
		'  @click       ="onClick"',
		'></my-element>',
	].join('\n'));
});

tsTest('puts direct tag expressions before and outside aligned bindings', t => {
	const document = parseHtml(
		'<my-element disabled ${tooltip(() => "description")} hidden attribute="value"></my-element>',
	);
	const edits = new LitHtmlVscodeService()
		.format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits.length, 1);
	t.is(edits[0].newText, [
		'<my-element',
		'  ${tooltip(() => "description")}',
		'  disabled ',
		'  hidden   ',
		'  attribute="value"',
		'></my-element>',
	].join('\n'));
});

tsTest('orders bindings by assignment kind', t => {
	const document = parseHtml(
		'<my-element @zoom=${onZoom} @change=${onChange} ?readonly=${readonly} ?enabled=${enabled} '
		+ '.zIndex=${zIndex} .property=${property} zExpression=${zValue} expression=${value} '
		+ 'zAttribute="last" attribute="text" hidden disabled></my-element>',
	);
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits[0].newText, [
		'<my-element',
		'  disabled   ',
		'  hidden     ',
		'  attribute  ="text"',
		'  zAttribute ="last"',
		'  expression =${value}',
		'  zExpression=${zValue}',
		'  .property  =${property}',
		'  .zIndex    =${zIndex}',
		'  ?enabled   =${enabled}',
		'  ?readonly  =${readonly}',
		'  @change    =${onChange}',
		'  @zoom      =${onZoom}',
		'></my-element>',
	].join('\n'));
});

tsTest('moves expressions with their grouped bindings', t => {
	const document = parseHtml(
		'<my-element '
		+ '@change=${onChange} attribute=${value} .longProperty=${property} ?enabled=${enabled} .short=${short} @click=${onClick}'
		+ '></my-element>',
	);
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits.length, 1);
	t.is(edits[0].newText, [
		'<my-element',
		'  attribute    =${value}',
		'  .longProperty=${property}',
		'  .short       =${short}',
		'  ?enabled     =${enabled}',
		'  @change      =${onChange}',
		'  @click       =${onClick}',
		'></my-element>',
	].join('\n'));
});

tsTest('preserves literal text that resembles an expression marker', t => {
	const document = parseHtml('<my-element data-marker="__0_" .value=${value} attribute="text"></my-element>');
	const edits = new LitHtmlVscodeService()
		.format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits[0].newText, [
		'<my-element',
		'  attribute  ="text"',
		'  data-marker="__0_"',
		'  .value     =${value}',
		'></my-element>',
	].join('\n'));
});

tsTest('uses the template indentation when no editor setting is supplied', t => {
	const document = parseHtml([
		'<section>',
		'  <my-element attribute="value" .property="property"></my-element>',
		'</section>',
	].join('\n'));
	const edits = new LitHtmlVscodeService().format(document, {}, enabledBindingFormatters);

	t.is(edits.length, 1);
	t.is(edits[0].newText, [
		'<section>',
		'  <my-element',
		'    attribute="value"',
		'    .property="property"',
		'  ></my-element>',
		'</section>',
	].join('\n'));
});

tsTest('uses tabs from the template when no editor setting is supplied', t => {
	const document = parseHtml([
		'<section>',
		'\t<my-element attribute="value" .property="property"></my-element>',
		'</section>',
	].join('\n'));
	const edits = new LitHtmlVscodeService().format(document, {}, enabledBindingFormatters);

	t.is(edits.length, 1);
	t.is(edits[0].newText, [
		'<section>',
		'\t<my-element',
		'\t\tattribute="value"',
		'\t\t.property="property"',
		'\t></my-element>',
		'</section>',
	].join('\n'));
});

tsTest('can disable binding grouping and assignment alignment', t => {
	const document = parseHtml('<my-element @change="onChange" attribute="value" .property="property"></my-element>');
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, {
		...enabledBindingFormatters,
		groupBindings:           false,
		alignBindingAssignments: false,
	});

	t.is(edits[0].newText, [
		'<my-element',
		'  @change="onChange"',
		'  attribute="value"',
		'  .property="property"',
		'></my-element>',
	].join('\n'));
});

tsTest('can group bindings without adding binding lines', t => {
	const document = parseHtml('<my-element @change="onChange" attribute="value" .property="property"></my-element>');
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, {
		...enabledBindingFormatters,
		newLineBindings: false,
	});

	t.is(edits[0].newText, '<my-element attribute="value" .property="property" @change="onChange"></my-element>');
});

tsTest('preserves multiline dynamic bindings', t => {
	const document = parseHtml([
		'<es-input',
		'  id="search"',
		'  size="small"',
		'  placeholder=${ localize("info.filterCompanies") }',
		'  .spellcheck=${ spellcheck }',
		'  ?readonly=${ readonly }',
		'></es-input>',
	].join('\n'));
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits[0].newText, [
		'<es-input',
		'  id         ="search"',
		'  size       ="small"',
		'  placeholder=${localize("info.filterCompanies")}',
		'  .spellcheck=${spellcheck}',
		'  ?readonly  =${readonly}',
		'></es-input>',
	].join('\n'));
});

tsTest('preserves a multiline expression in a dynamic binding', t => {
	const document = parseHtml([
		'<my-element',
		'  .config=${ buildConfig(',
		'    firstOption,',
		'    secondOption,',
		'  ) }',
		'  attribute="value"',
		'></my-element>',
	].join('\n'));
	const edits = new LitHtmlVscodeService().format(document, { tabSize: 2, convertTabsToSpaces: true }, enabledBindingFormatters);

	t.is(edits[0].newText, [
		'<my-element',
		'  attribute="value"',
		'  .config  =${buildConfig(',
		'    firstOption,',
		'    secondOption,',
		'  )}',
		'></my-element>',
	].join('\n'));
});

tsTest('does not return overlapping edits for nested HTML templates', t => {
	const { analyzer, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		entry:    true,
		text:     [
			'declare const html: any;',
			'declare const when: any;',
			'declare const value: string;',
			'html`<slot>${when(true, () => html`<span>${value}</span>`)}</slot>`;',
		].join('\n'),
	});
	const edits = analyzer.getFormatEditsInFile(sourceFile, { tabSize: 2, convertTabsToSpaces: true });

	t.is(edits.length, 1);
	t.true(edits[0].newText.includes('html`\n  <span>${value}</span>\n`'));
	t.true(!edits[0].newText.includes('[#'));
});

tsTest('preserves indentation in nested multiline HTML templates', t => {
	const { analyzer, sourceFile } = prepareAnalyzer({
		fileName: 'source.ts',
		entry:    true,
		text:     [
			'declare const html: any;',
			'declare const when: any;',
			'declare const value: string;',
			'html`',
			'\t<slot slot="trigger">',
			'\t\t${ when(true, () => html`',
			'\t\t\t<span>${ value }</span>',
			'\t\t`) }',
			'\t</slot>',
			'`;',
		].join('\n'),
	});
	const edits = analyzer.getFormatEditsInFile(sourceFile, { tabSize: 2, convertTabsToSpaces: true });

	t.is(edits.length, 1);
	t.true(edits[0].newText.includes('    <span>${value}</span>'));
	t.true(edits[0].newText.includes('  `)}'));
});
