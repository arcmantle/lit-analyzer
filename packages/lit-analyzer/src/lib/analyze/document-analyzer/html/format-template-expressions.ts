import * as ts from 'typescript';

import { type LitAnalyzerFormatConfig } from '../../lit-analyzer-config.js';
import { HtmlDocument } from '../../parse/document/text-document/html-document/html-document.js';
import { parseHtmlDocument } from '../../parse/document/text-document/html-document/parse-html-document.js';
import { makeDocumentRange } from '../../util/range-util.js';
import { bindingIndentation, formatBindingAttributes } from './format-binding-attributes.js';
import { addTemplateBoundaryNewlines, formatGenericHtml, templateIndentation } from './format-generic-html.js';

export function formatTemplateText(
	document: HtmlDocument,
	settings: ts.FormatCodeSettings,
	format: LitAnalyzerFormatConfig,
	boundaryIndentation?: string,
): string {
	const parts = document.virtualDocument.getPartsAtDocumentRange(
		makeDocumentRange({
			start: 0,
			end:   document.virtualDocument.location.end - document.virtualDocument.location.start,
		}),
	);
	const protectedExpressions = protectTemplateExpressions(document.virtualDocument.text, parts);
	const formattedBindings = formatBindingAttributes(document, protectedExpressions.html, settings, format);
	const formattedHtml = formattedBindings ?? formatGenericHtml(protectedExpressions.html, settings);
	const boundedHtml = format.newLineTemplate
		? addTemplateBoundaryNewlines(formattedHtml, boundaryIndentation ?? templateIndentation(protectedExpressions.html))
		: formattedHtml;

	return restoreTemplateExpressions(boundedHtml, protectedExpressions.expressions, settings, format);
}

export function restoreTemplateExpressions(
	html: string,
	expressions: ReadonlyMap<string, ts.Expression>,
	settings: ts.FormatCodeSettings,
	format: LitAnalyzerFormatConfig,
): string {
	for (const [ placeholder, expression ] of expressions) {
		const placeholderOffset = html.indexOf(placeholder);
		const indentation = nodeIndentation(html, placeholderOffset);
		const formattedExpression = formatNestedHtmlTemplates(expression, indentation, settings, format);
		const reindentedExpression = isLineRootExpression(html, placeholderOffset)
			? reindentMultilineExpression(formattedExpression, expression, indentation)
			: formattedExpression;
		const replacement = `\${${ reindentedExpression }}`;
		html = html.replaceAll(placeholder, replacement);
	}

	return html;
}

export function protectTemplateExpressions(
	html: string,
	parts: (ts.Expression | string)[],
): { html: string; expressions: ReadonlyMap<string, ts.Expression>; } {
	const expressions: Map<string, ts.Expression> = new Map();
	let offset = 0;
	let expressionIndex = 0;
	let protectedHtml = '';

	for (const part of parts) {
		if (typeof part === 'string') {
			protectedHtml += html.slice(offset, offset + part.length);
			offset += part.length;
			continue;
		}

		const length = virtualExpressionLength(part);
		const placeholder = makeExpressionPlaceholder(html, length, expressionIndex, expressions);
		protectedHtml += placeholder;
		offset += length;
		expressions.set(placeholder, part);
		expressionIndex += 1;
	}

	return { html: `${ protectedHtml }${ html.slice(offset) }`, expressions };
}

function virtualExpressionLength(expression: ts.Expression): number {
	const end = ts.isTemplateSpan(expression.parent) ? expression.parent.literal.getStart() : expression.getEnd();

	return end - expression.getFullStart() + 3;
}

function makeExpressionPlaceholder(
	html: string,
	length: number,
	expressionIndex: number,
	expressions: ReadonlyMap<string, ts.Expression>,
): string {
	const valueWidth = length - 2;
	for (let attempt = expressionIndex; ; attempt += 1) {
		const value = attempt.toString(36).padStart(valueWidth, '0');
		const placeholder = `x${ value.slice(-valueWidth) }x`;
		if (!html.includes(placeholder) && !expressions.has(placeholder))
			return placeholder;
	}
}

function formatNestedHtmlTemplates(
	expression: ts.Expression,
	indentation: string,
	settings: ts.FormatCodeSettings,
	format: LitAnalyzerFormatConfig,
): string {
	const replacements: { start: number; end: number; text: string; }[] = [];

	function visit(node: ts.Node): void {
		if (ts.isTaggedTemplateExpression(node) && node.tag.getText() === 'html') {
			const document = parseHtmlDocument(node);
			const formattedHtml = formatTemplateText(document, settings, format, '');
			const indentationUnit = bindingIndentation(document.virtualDocument.text, settings);
			const indentedTemplate = indentNestedTemplate(formattedHtml, indentation, indentationUnit);
			const text = `${ node.tag.getText() }\`${ indentedTemplate }\``;

			replacements.push({
				start: node.getStart() - expression.getStart(),
				end:   node.getEnd() - expression.getStart(),
				text,
			});

			return;
		}

		node.forEachChild(visit);
	}

	visit(expression);
	let text = expression.getText();
	for (const replacement of replacements.sort((left, right) => right.start - left.start))
		text = `${ text.slice(0, replacement.start) }${ replacement.text }${ text.slice(replacement.end) }`;

	return text;
}

function isLineRootExpression(html: string, offset: number): boolean {
	return /^[\t ]*$/.test(html.slice(html.lastIndexOf('\n', offset) + 1, offset));
}

function reindentMultilineExpression(expressionText: string, expression: ts.Expression, indentation: string): string {
	const sourcePrefix = expression.getSourceFile().text
		.slice(0, expression.getStart())
		.match(/(?:^|\n)([\t ]*)\S[^\n]*$/)?.[1] ?? '';
	if (sourcePrefix === '')
		return expressionText;

	return expressionText.split('\n').map((line, index) => {
		if (index === 0)
			return line;

		const relativeIndentation = line.startsWith(sourcePrefix) ? line.slice(sourcePrefix.length) : line;

		return `${ indentation }${ relativeIndentation }`;
	}).join('\n');
}

function indentNestedTemplate(html: string, indentation: string, indentationUnit: string): string {
	const lines = html.split('\n');

	return lines.map((line, index) => {
		if (index === 0)
			return line;
		else if (index === lines.length - 1)
			return `${ indentation }${ line }`;

		return `${ indentation }${ indentationUnit }${ line }`;
	}).join('\n');
}

function nodeIndentation(html: string, offset: number): string {
	return html.slice(0, offset).match(/(?:^|\n)([\t ]*)$/)?.[1] ?? '';
}
