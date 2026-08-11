import * as ts from 'typescript';

import { type LitAnalyzerFormatConfig } from '../../lit-analyzer-config.js';
import { HtmlDocument } from '../../parse/document/text-document/html-document/html-document.js';
import { HtmlNodeAttrAssignmentKind } from '../../types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttr, HtmlNodeAttrKind } from '../../types/html-node/html-node-attr-types.js';

function bindingOrder(attribute: HtmlNodeAttr): number {
	if (attribute.kind === HtmlNodeAttrKind.ATTRIBUTE) {
		switch (attribute.assignment?.kind) {
		case HtmlNodeAttrAssignmentKind.ELEMENT_EXPRESSION:
			return -1;
		case HtmlNodeAttrAssignmentKind.BOOLEAN:
			return 0;
		case HtmlNodeAttrAssignmentKind.STRING:
			return 1;
		default:
			return 2;
		}
	}

	switch (attribute.kind) {
	case HtmlNodeAttrKind.PROPERTY:
		return 3;
	case HtmlNodeAttrKind.BOOLEAN_ATTRIBUTE:
		return 4;
	case HtmlNodeAttrKind.EVENT_LISTENER:
		return 5;
	}
}

function compareBindings(left: HtmlNodeAttr, right: HtmlNodeAttr): number {
	const orderDifference = bindingOrder(left) - bindingOrder(right);
	if (orderDifference !== 0)
		return orderDifference;

	if (isElementExpression(left))
		return 0;

	return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

export function formatBindingAttributes(
	document: HtmlDocument,
	html: string,
	settings: ts.FormatCodeSettings,
	format: LitAnalyzerFormatConfig,
): string | undefined {
	if (format.disable || (!format.groupBindings && !format.newLineBindings))
		return undefined;

	const indentation = bindingIndentation(html, settings);
	const replacements = Array.from(document.nodes())
		.filter(node => node.attributes.length > 1)
		.map(node => {
			const indentationBeforeNode = nodeIndentation(html, node.location.startTag.start);
			const attributes = format.groupBindings
				? [ ...node.attributes ].sort(compareBindings)
				: node.attributes;
			const tagName = html.slice(node.location.startTag.start, node.location.name.end);
			const closing = node.selfClosed ? '/>' : '>';
			if (!format.newLineBindings) {
				const formattedAttributes = attributes.map(attribute => attributeText(html, attribute, false).trim()).join(' ');

				return {
					start: node.location.startTag.start,
					end:   node.location.startTag.end,
					text:  `${ tagName } ${ formattedAttributes }${ closing }`,
				};
			}

			const names = attributes.map(attribute => attributeText(html, attribute, true));
			const width = format.alignBindingAssignments
				? Math.max(0, ...names.filter((_, index) => !isElementExpression(attributes[index])).map(name => name.length))
				: 0;
			const bindingLines = attributes.map((attribute, index) => {
				const name = names[index];
				const value = attributeText(html, attribute, false);
				const lineIndentation = `${ indentationBeforeNode }${ indentation }`;
				if (isElementExpression(attribute))
					return `${ lineIndentation }${ value.trim() }`;

				const assignment = value.slice(name.length).trimStart();
				const assignmentValue = assignment.slice(1).trimStart();
				const formattedAssignment = assignment.startsWith('=')
					? `=${ assignmentValue }`
					: '';

				const formattedName = format.alignBindingAssignments ? name.padEnd(width) : name;

				return `${ lineIndentation }${ formattedName }${ formattedAssignment }`;
			});

			return {
				start: node.location.startTag.start,
				end:   node.location.startTag.end,
				text:  `${ tagName }\n${ bindingLines.join('\n') }\n${ indentationBeforeNode }${ closing }`,
			};
		})
		.sort((left, right) => right.start - left.start);
	if (replacements.length === 0)
		return undefined;

	for (const replacement of replacements)
		html = `${ html.slice(0, replacement.start) }${ replacement.text }${ html.slice(replacement.end) }`;

	return html;
}

export function bindingIndentation(html: string, settings: ts.FormatCodeSettings): string {
	if (settings.convertTabsToSpaces === false)
		return '\t';

	if (settings.convertTabsToSpaces === true || !templateUsesTabs(html))
		return ' '.repeat(settings.tabSize ?? 2);

	return '\t';
}

function attributeText(html: string, attribute: HtmlNodeAttr, nameOnly: boolean): string {
	const end = nameOnly ? attribute.location.name.end : attribute.location.end;

	return html.slice(attribute.location.start, end);
}

function isElementExpression(attribute: HtmlNodeAttr): boolean {
	return attribute.assignment?.kind === HtmlNodeAttrAssignmentKind.ELEMENT_EXPRESSION;
}

function nodeIndentation(html: string, offset: number): string {
	return html.slice(0, offset).match(/(?:^|\n)([\t ]*)$/)?.[1] ?? '';
}

function templateUsesTabs(html: string): boolean {
	return /(?:^|\n)[\t ]*\t/.test(html);
}
