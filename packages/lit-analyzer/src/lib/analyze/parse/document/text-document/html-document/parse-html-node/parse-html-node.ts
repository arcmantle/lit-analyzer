import { TS_IGNORE_FLAG } from '../../../../../constants.js';
import { HtmlNode, HtmlNodeKind, IHtmlNodeBase, IHtmlNodeSourceCodeLocation } from '../../../../../types/html-node/html-node-types.js';
import { isCommentNode, isTagNode } from '../parse-html-p5/parse-html.js';
import { P5Node, P5TagNode, P5WrittenElementSourceCodeLocation } from '../parse-html-p5/parse-html-types.js';
import { parseHtmlNodeAttrs } from './parse-html-attribute.js';
import { ParseHtmlContext } from './parse-html-context.js';

/**
 * Parses multiple p5Nodes into multiple html nodes.
 * @param p5Nodes
 * @param parent
 * @param context
 */
export function parseHtmlNodes(p5Nodes: P5Node[], parent: HtmlNode | undefined, context: ParseHtmlContext): HtmlNode[] {
	const htmlNodes: HtmlNode[] = [];
	let ignoreNextNode = false;
	for (const p5Node of p5Nodes) {
		// Check ts-ignore comments and indicate that we wan't to ignore the next node
		if (isCommentNode(p5Node)) {
			if (p5Node.data != null && p5Node.data.includes(TS_IGNORE_FLAG))
				ignoreNextNode = true;
		}

		if (isTagNode(p5Node)) {
			if (!ignoreNextNode) {
				const htmlNode = parseHtmlNode(p5Node, parent, context);

				if (htmlNode != null)
					htmlNodes.push(htmlNode);
			}
			else {
				ignoreNextNode = false;
			}
		}
	}

	return htmlNodes;
}

/**
 * Parses a single p5Node into a html node.
 * @param p5Node
 * @param parent
 * @param context
 */
export function parseHtmlNode(p5Node: P5TagNode, parent: HtmlNode | undefined, context: ParseHtmlContext): HtmlNode | undefined {
	// `sourceCodeLocation` will be undefined if the element was implicitly created by the parser.
	const location = p5Node.sourceCodeLocation as P5WrittenElementSourceCodeLocation | undefined | null;
	if (location?.startTag == null)
		return undefined;

	const htmlNodeBase: IHtmlNodeBase = {
		tagName:    p5Node.tagName.toLowerCase(),
		selfClosed: isSelfClosed(p5Node, location),
		attributes: [],
		location:   makeHtmlNodeLocation(p5Node, location),
		children:   [],
		document:   context.document,
		parent,
	};

	const htmlNode = parseHtmlNodeBase(htmlNodeBase);

	// Don't parse children of <style> and <svg> as of now
	if (htmlNode.kind === HtmlNodeKind.NODE)
		htmlNode.children = parseHtmlNodes(p5Node.childNodes || [], htmlNode, context);


	htmlNode.attributes = parseHtmlNodeAttrs(p5Node, { ...context, htmlNode });

	return htmlNode;
}

/**
 * Returns if this node is self-closed.
 * @param p5Node
 * @param location
 */
function isSelfClosed(p5Node: P5TagNode, location: P5WrittenElementSourceCodeLocation) {
	const isEmpty = p5Node.childNodes == null || p5Node.childNodes.length === 0;
	const isSelfClosed = location.startTag.endOffset === location.endOffset;

	return isEmpty && isSelfClosed;
}

/**
 * Creates source code location from a p5Node.
 * @param p5Node
 * @param loc
 */
function makeHtmlNodeLocation(p5Node: P5TagNode, loc: P5WrittenElementSourceCodeLocation): IHtmlNodeSourceCodeLocation {
	const startTag = loc.startTag;

	return {
		start: loc.startOffset,
		end:   loc.endOffset,
		name:  {
			start: startTag.startOffset + 1, // take '<' into account
			end:   startTag.startOffset + 1 + p5Node.tagName.length,
		},
		startTag: {
			start: startTag.startOffset,
			end:   startTag.endOffset,
		},
		endTag:
			loc.endTag == null
				? undefined
				: {
					start: loc.endTag.startOffset,
					end:   loc.endTag.endOffset,
				},
	};
}

function parseHtmlNodeBase(htmlNodeBase: IHtmlNodeBase): HtmlNode {
	if (htmlNodeBase.tagName === 'style') {
		return {
			kind:     HtmlNodeKind.STYLE,
			...htmlNodeBase,
			children: [],
		};
	}
	else if (htmlNodeBase.tagName === 'svg') {
		// Ignore children of "svg" for now
		return {
			kind:     HtmlNodeKind.SVG,
			...htmlNodeBase,
			children: [],
		};
	}

	return {
		kind: HtmlNodeKind.NODE,
		...htmlNodeBase,
	};

	/*if (component != null) {
	 return {
	 ...htmlNodeBase,
	 kind: HtmlNodeKind.COMPONENT,
	 component
	 };
	 }

	 if (isBuiltInTag(htmlNodeBase.tagName)) {
	 // For now: opt out of svg and style children tags
	 // TODO: Handle svg and style tags
	 const isBlacklisted = ["svg", "style"].includes(htmlNodeBase.tagName);

	 return {
	 ...htmlNodeBase,
	 kind: HtmlNodeKind.BUILT_IN,
	 children: isBlacklisted ? [] : htmlNodeBase.children
	 };
	 }*/

	/*return {
	 kind: HtmlNodeKind.UNKNOWN,
	 ...htmlNodeBase
	 };*/
}
