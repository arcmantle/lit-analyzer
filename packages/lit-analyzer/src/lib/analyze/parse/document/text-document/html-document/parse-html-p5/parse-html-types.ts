import type { DefaultTreeAdapterTypes, Token } from 'parse5';

export type P5DocumentFragmentNode = DefaultTreeAdapterTypes.DocumentFragment;
export type P5TagNode = DefaultTreeAdapterTypes.Element;
export type P5TextNode = DefaultTreeAdapterTypes.TextNode;
export type P5CommentNode = DefaultTreeAdapterTypes.CommentNode;
export type P5Node = DefaultTreeAdapterTypes.ChildNode;
export type P5NodeAttr = Token.Attribute;
export type P5ElementSourceCodeLocation = Token.ElementLocation;

/** An element location from a tag that is written in the source, so it has a start tag. */
export type P5WrittenElementSourceCodeLocation = P5ElementSourceCodeLocation & { startTag: Token.Location; };
