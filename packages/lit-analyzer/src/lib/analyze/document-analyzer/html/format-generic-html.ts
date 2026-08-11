import * as ts from 'typescript';
import { getLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

const htmlService = getLanguageService();

export function formatGenericHtml(html: string, settings: ts.FormatCodeSettings): string {
	const document = TextDocument.create('untitled://embedded.html', 'html', 1, html);
	const edits = htmlService.format(document, undefined, {
		tabSize:             settings.tabSize,
		insertSpaces:        !!settings.convertTabsToSpaces,
		wrapLineLength:      90,
		unformatted:         '',
		contentUnformatted:  'pre,code,textarea',
		indentInnerHtml:     true,
		preserveNewLines:    true,
		maxPreserveNewLines: undefined,
		indentHandlebars:    false,
		endWithNewline:      false,
		extraLiners:         'head, body, /html',
		wrapAttributes:      'auto',
	});

	const hasLeadingNewline = html.startsWith('\n');
	const hasTrailingNewline = html.endsWith('\n');

	return `${ hasLeadingNewline ? '\n' : '' }${
		TextDocument.applyEdits(document, edits)
	}${ hasTrailingNewline ? '\n' : '' }`;
}

export function addTemplateBoundaryNewlines(html: string, indentation = templateIndentation(html)): string {
	const contentIndentation = templateIndentation(html);
	const content = html
		.replace(/^(?:[\t ]*\n)+|(?:\n[\t ]*)+$/g, '')
		.split('\n')
		.map(line => line.startsWith(contentIndentation) ? line.slice(contentIndentation.length) : line)
		.join('\n');
	const indentedContent = content.split('\n').map(line =>
		line === '' ? line : `${ indentation }${ line }`).join('\n');

	return `\n${ indentedContent }\n${ indentation }`;
}

export function templateIndentation(html: string): string {
	return html.match(/(?:^|\n)([\t ]*)\S/)?.[1] ?? '';
}
