import * as ts from 'typescript';
import type * as vscodeTypes from 'vscode-html-languageservice';
import { getLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { HtmlDocument } from '../../parse/document/text-document/html-document/html-document.js';
import { textPartsToRanges } from '../../parse/document/virtual-document/virtual-document.js';
import { LitClosingTagInfo } from '../../types/lit-closing-tag-info.js';
import { LitFormatEdit } from '../../types/lit-format-edit.js';
import { DocumentOffset } from '../../types/range.js';
import { documentRangeToSFRange, makeDocumentRange } from '../../util/range-util.js';

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

	format(document: HtmlDocument, settings: ts.FormatCodeSettings): LitFormatEdit[] {
		const parts = document.virtualDocument.getPartsAtDocumentRange(
			makeDocumentRange({
				start: 0,
				end:   document.virtualDocument.location.end - document.virtualDocument.location.start,
			}),
		);

		const ranges = textPartsToRanges(parts);
		const originalHtml = parts.map(p => (typeof p === 'string' ? p : `[#${ '#'.repeat(p.getText().length) }]`)).join('');
		const vscTextDocument = TextDocument.create('untitled://embedded.html', 'html', 1, originalHtml);

		const edits = htmlService.format(vscTextDocument, undefined, {
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

		const hasLeadingNewline = originalHtml.startsWith('\n');
		const hasTrailingNewline = originalHtml.endsWith('\n');

		const newHtml = `${ hasLeadingNewline ? '\n' : '' }${
			TextDocument.applyEdits(vscTextDocument, edits)
		}${ hasTrailingNewline ? '\n' : '' }`;

		const splitted = newHtml.split(/\[#+\]/);

		return splitted.map((newText, i) => {
			const range = ranges[i];

			return { range: documentRangeToSFRange(document, range), newText };
		});
	}

}
