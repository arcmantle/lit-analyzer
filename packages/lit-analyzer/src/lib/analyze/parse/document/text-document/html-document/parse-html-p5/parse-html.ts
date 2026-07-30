import { parseFragment } from 'parse5';

import { P5CommentNode, P5DocumentFragmentNode, P5Node, P5TagNode, P5TextNode } from './parse-html-types.js';

/**
 * Returns if a p5Node is a tag node.
 * @param node
 */
export function isTagNode(node: P5Node): node is P5TagNode {
	return !node.nodeName.includes('#');
}

/**
 * Returns if a p5Node is a document fragment.
 * @param node
 */
export function isDocumentFragmentNode(node: P5Node | P5DocumentFragmentNode): node is P5DocumentFragmentNode {
	return node.nodeName === '#document-fragment';
}

/**
 * Returns if a p5Node is a text node.
 * @param node
 */
export function isTextNode(node: P5Node): node is P5TextNode {
	return node.nodeName === '#text';
}

/**
 * Returns if a p5Node is a comment node.
 * @param node
 */
export function isCommentNode(node: P5Node): node is P5CommentNode {
	return node.nodeName === '#comment';
}

/**
 * Parse a html string into p5Nodes.
 * @param html
 */
export function parseHtml(html: string): P5DocumentFragmentNode {
	return parseFragment(html, { sourceCodeLocationInfo: true });
}
