import { Node, Symbol as TypeScriptSymbol, TypeChecker } from 'typescript';

import { LitAnalyzerContext } from '../../../lit-analyzer-context.js';
import { isHtmlEvent, isHtmlMember } from '../../../parse/parse-html-data/html-tag.js';
import { HtmlNodeAttr } from '../../../types/html-node/html-node-attr-types.js';
import { LitDefinition } from '../../../types/lit-definition.js';
import { getNodeIdentifier } from '../../../util/ast-util.js';
import { rangeFromHtmlNodeAttr } from '../../../util/range-util.js';

const HTML_ATTRIBUTE_PROPERTY_ALIASES: Readonly<Record<string, string>> = {
	class: 'className',
	for:   'htmlFor',
};

export function definitionForHtmlAttr(
	htmlAttr: HtmlNodeAttr,
	context: LitAnalyzerContext,
): LitDefinition | undefined {
	const { htmlStore, program, ts } = context;
	const target = htmlStore.getHtmlAttrTarget(htmlAttr);

	if (target != null && (isHtmlMember(target) || isHtmlEvent(target)) && target.declaration != null)
		return definitionForNode(htmlAttr, target.declaration.node, target.name, ts);

	if (target == null || isHtmlMember(target)) {
		const propertySymbol = findBuiltInHtmlProperty(htmlAttr, program.getTypeChecker(), context.currentFile, ts);
		const node = propertySymbol?.valueDeclaration ?? propertySymbol?.declarations?.[0];

		if (propertySymbol != null && node != null)
			return definitionForNode(htmlAttr, node, propertySymbol.getName(), ts);
	}

	return;
}

function findBuiltInHtmlProperty(
	htmlAttr: HtmlNodeAttr,
	checker: TypeChecker,
	currentFile: Node,
	ts: LitAnalyzerContext['ts'],
): TypeScriptSymbol | undefined {
	const tagNameMap = checker.resolveName('HTMLElementTagNameMap', currentFile, ts.SymbolFlags.Interface, false);
	if (tagNameMap == null)
		return undefined;

	const tagSymbol = checker.getPropertyOfType(checker.getDeclaredTypeOfSymbol(tagNameMap), htmlAttr.htmlNode.tagName);
	const tagDeclaration = tagSymbol?.valueDeclaration ?? tagSymbol?.declarations?.[0];
	const tagType = tagSymbol == null || tagDeclaration == null
		? getHtmlElementType(checker, currentFile, ts)
		: checker.getTypeOfSymbolAtLocation(tagSymbol, tagDeclaration);
	if (tagType == null)
		return undefined;

	const propertyName = HTML_ATTRIBUTE_PROPERTY_ALIASES[htmlAttr.name.toLowerCase()] ?? htmlAttr.name;
	const normalizedPropertyName = normalizeHtmlMemberName(propertyName);

	return checker.getPropertiesOfType(tagType)
		.find(symbol => normalizeHtmlMemberName(symbol.getName()) === normalizedPropertyName);
}

function getHtmlElementType(
	checker: TypeChecker,
	currentFile: Node,
	ts: LitAnalyzerContext['ts'],
) {
	const htmlElement = checker.resolveName('HTMLElement', currentFile, ts.SymbolFlags.Interface, false);

	return htmlElement == null ? undefined : checker.getDeclaredTypeOfSymbol(htmlElement);
}

function normalizeHtmlMemberName(name: string): string {
	return name.replaceAll('-', '').toLowerCase();
}

function definitionForNode(
	htmlAttr: HtmlNodeAttr,
	node: Node,
	name: string,
	ts: LitAnalyzerContext['ts'],
): LitDefinition {
	return {
		fromRange: rangeFromHtmlNodeAttr(htmlAttr),
		targets:   [
			{
				kind: 'node',
				node: getNodeIdentifier(node, ts) || node,
				name,
			},
		],
	};
}
