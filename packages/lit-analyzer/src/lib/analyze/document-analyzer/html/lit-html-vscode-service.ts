import * as ts from 'typescript';
import type * as vscodeTypes from 'vscode-html-languageservice';
import { getLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { type LitAnalyzerFormatConfig } from '../../lit-analyzer-config.js';
import { HtmlDocument } from '../../parse/document/text-document/html-document/html-document.js';
import { textPartsToRanges } from '../../parse/document/virtual-document/virtual-document.js';
import { LitClosingTagInfo } from '../../types/lit-closing-tag-info.js';
import { LitFormatEdit } from '../../types/lit-format-edit.js';
import { DocumentOffset } from '../../types/range.js';
import { documentRangeToSFRange, makeDocumentRange } from '../../util/range-util.js';
import { formatBindingAttributes } from './format-binding-attributes.js';
import { addTemplateBoundaryNewlines, formatGenericHtml } from './format-generic-html.js';
import { protectTemplateExpressions, restoreTemplateExpressions } from './format-template-expressions.js';

const htmlService = getLanguageService();

function makeVscTextDocument(htmlDocument: HtmlDocument): vscodeTypes.TextDocument {
	return TextDocument.create('untitled://embedded.html', 'html', 1, htmlDocument.virtualDocument.text);
}

function makeVscHtmlDocument(vscTextDocument: vscodeTypes.TextDocument) {
	return htmlService.parseHTMLDocument(vscTextDocument);
}

export class LitHtmlVscodeService {

	getClosingTagAtOffset(document: HtmlDocument, offset: DocumentOffset): LitClosingTagInfo | undefined {
		const vscTextDocument = makeVscTextDocument(document);
		const vscHtmlDocument = makeVscHtmlDocument(vscTextDocument);
		const htmlLSPosition = vscTextDocument.positionAt(offset);

		const tagComplete = htmlService.doTagComplete(vscTextDocument, htmlLSPosition, vscHtmlDocument);
		if (tagComplete == null)
			return;

		// Html returns completions with snippet placeholders. Strip these out.
		return {
			newText: tagComplete.replace(/\$\d/g, ''),
		};
	}

	format(document: HtmlDocument, settings: ts.FormatCodeSettings, format?: LitAnalyzerFormatConfig): LitFormatEdit[] {
		const parts = document.virtualDocument.getPartsAtDocumentRange(
			makeDocumentRange({
				start: 0,
				end:   document.virtualDocument.location.end - document.virtualDocument.location.start,
			}),
		);

		const ranges = textPartsToRanges(parts);
		const html = document.virtualDocument.text;
		if (format != null) {
			const protectedExpressions = protectTemplateExpressions(html, parts);
			const formattedBindings = formatBindingAttributes(document, protectedExpressions.html, settings, format);
			if (formattedBindings != null || format.newLineTemplate) {
				const formattedHtml = formattedBindings ?? formatGenericHtml(protectedExpressions.html, settings);
				const newHtml = format.newLineTemplate
					? addTemplateBoundaryNewlines(formattedHtml, templateIndentation(document))
					: formattedHtml;

				return [
					{
						range:   document.virtualDocument.location,
						newText: restoreTemplateExpressions(newHtml, protectedExpressions.expressions, settings, format),
					},
				];
			}
		}

		const genericHtml = parts.map(p => (typeof p === 'string' ? p : `[#${ '#'.repeat(p.getText().length) }]`)).join('');
		const newHtml = formatGenericHtml(genericHtml, settings);

		const splitted = newHtml.split(/\[#+\]/);

		return splitted.map((newText, i) => {
			const range = ranges[i];

			return { range: documentRangeToSFRange(document, range), newText };
		});
	}

}

function templateIndentation(document: HtmlDocument): string {
	const prefix = document.sourceFile.text.slice(0, document.virtualDocument.location.start);

	return prefix.match(/(?:^|\n)([\t ]*)\S[^\n]*$/)?.[1] ?? '';
}
