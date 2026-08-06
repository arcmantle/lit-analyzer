import type tsModule from 'typescript';
import { JSDoc, JSDocParameterTag, JSDocTag, JSDocTypeTag, Node, Program, type Type, type TypeChecker, TypeFlags } from 'typescript';

import { arrayDefined } from '../../util/array-util.js';
import { JsDoc, JsDocTag, JsDocTagParsed } from '../types/js-doc.js';
import { getLeadingCommentForNode } from './ast-util.js';
import { lazy } from './lazy.js';

/**
 * Returns typescript jsdoc node for a given node
 * @param node
 * @param ts
 */
function getJSDocNode(node: Node, ts: typeof tsModule): JSDoc | undefined {
	const parent = ts.getJSDocTags(node)?.[0]?.parent;
	if (parent != null && ts.isJSDoc(parent))
		return parent;


	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((node as any).jsDoc as Node[])?.find((n): n is JSDoc => ts.isJSDoc(n));
}

/**
 * Returns jsdoc for a given node.
 * @param node
 * @param ts
 * @param tagNames
 */
export function getJsDoc(node: Node, ts: typeof tsModule, tagNames?: string[]): JsDoc | undefined {
	const jsDocNode = getJSDocNode(node, ts);

	// If we couldn't find jsdoc, find and parse the jsdoc string ourselves
	if (jsDocNode == null) {
		const leadingComment = getLeadingCommentForNode(node, ts);

		if (leadingComment != null) {
			const jsDoc = parseJsDocString(leadingComment);

			// Return this jsdoc if we don't have to filter by tag name
			if (jsDoc == null || tagNames == null || tagNames.length === 0)
				return jsDoc;


			return {
				...jsDoc,
				tags: jsDoc.tags?.filter(t => tagNames.includes(t.tag)),
			};
		}

		return undefined;
	}

	// Parse all jsdoc tags
	// Typescript removes some information after parsing jsdoc tags, so unfortunately we will have to parse.
	return {
		description: jsDocNode.comment == null ? undefined : unescapeJSDoc(String(jsDocNode.comment)),
		node:        jsDocNode,
		tags:
			jsDocNode.tags == null
				? []
				: arrayDefined(
					jsDocNode.tags.map(node => {
						const tag = String(node.tagName.escapedText);

						// Filter by tag name
						if (tagNames != null && tagNames.length > 0 && !tagNames.includes(tag.toLowerCase()))
							return undefined;


						// If Typescript generated a "type expression" or "name", comment will not include those.
						// We can't just use what typescript parsed because it doesn't include things like optional jsdoc: name notation [...]
						// Therefore we need to manually get the text and remove newlines/*
						const typeExpressionPart = 'typeExpression' in node
							? (node as JSDocTypeTag).typeExpression?.getText()
							: undefined;
						const namePart = 'name' in node ? (node as JSDocParameterTag).name?.getText() : undefined;

						const fullComment = typeExpressionPart?.startsWith('@')
							? // Typescript can include the rest of the jsdocs tag in "typeExpressionPart" when parsing fails.
						// Keep only the first tag in that case.
							typeExpressionPart.split(/\n\s*\*\s?@/)[0] || ''
							: `@${ tag }${ typeExpressionPart != null ? ` ${ typeExpressionPart } ` : '' }${
								namePart != null ? ` ${ namePart } ` : ''
							} ${
									node.comment || ''
							  }`;

						const comment = typeof node.comment === 'string' ? node.comment.replace(/^\s*-\s*/, '').trim() : '';

						return {
							node,
							tag,
							comment,
							parsed: lazy(() => parseJsDocTagString(fullComment)),
						};
					}),
				),
	};
}

const JSDOC_TYPE_SOURCE_FILE = '__jsdoc_type__.ts';

export function splitTopLevel(expression: string, separator: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	let quote: string | undefined;

	for (let index = 0; index < expression.length; index++) {
		const character = expression[index];
		if (quote != null) {
			if (character === quote && expression[index - 1] !== '\\')
				quote = undefined;
		}
		else if (character === '"' || character === "'") {
			quote = character;
		}
		else if ('<[{('.includes(character)) {
			depth++;
		}
		else if ('>]})'.includes(character)) {
			depth--;
		}
		else if (character === separator && depth === 0) {
			parts.push(expression.slice(start, index));
			start = index + 1;
		}
	}

	if (parts.length === 0)
		return [ expression ];

	parts.push(expression.slice(start));

	return parts;
}

function parseTypeScriptTypeExpression(str: string, context: { ts: typeof tsModule; checker: TypeChecker; }): Type {
	const sourceFile = context.ts.createSourceFile(
		JSDOC_TYPE_SOURCE_FILE,
		`type __JsDocType = ${ str };`,
		context.ts.ScriptTarget.Latest,
		true,
		context.ts.ScriptKind.TS,
	);
	const declaration = sourceFile.statements[0];

	if (!context.ts.isTypeAliasDeclaration(declaration))
		return context.checker.getAnyType();

	return context.checker.getTypeFromTypeNode(declaration.type);
}

export interface JsDocTypeNormalizationContext {
	ts:                      typeof tsModule;
	checker?:                TypeChecker;
	isResolvableIdentifier?: (identifier: string) => boolean;
}

export function normalizeJsDocTypeExpression(str: string, context: JsDocTypeNormalizationContext): string {
	const expression = str.trim();
	if (expression.length === 0)
		return 'any';

	switch (expression.toLowerCase()) {
	case 'array':
		return 'any[]';
	case '*':
		return 'any';
	}

	const prefixMatch = expression.match(/^(\?|!|(\.\.\.))(.+)$/);
	if (prefixMatch != null) {
		const type = normalizeJsDocTypeExpression(prefixMatch[3], context);
		switch (prefixMatch[1]) {
		case '?':
			return `(${ type }) | null`;
		case '!':
			return type;
		case '...':
			return `(${ type })[]`;
		}
	}

	const arrayMatch = expression.match(/^\[(.+)]$/);
	if (arrayMatch != null)
		return `(${ normalizeJsDocTypeExpression(arrayMatch[1], context) })[]`;

	const unionParts = splitTopLevel(expression, '|');
	if (unionParts.length > 1) {
		return unionParts
			.map(part => {
				const normalizedPart = normalizeJsDocTypeExpression(part, context);
				const trimmedPart = part.trim();
				if (/^[A-Za-z_$][\w$-]*$/.test(trimmedPart)) {
					const isResolvable = context.isResolvableIdentifier?.(trimmedPart);
					const type = context.checker == null
						? undefined
						: parseTypeScriptTypeExpression(normalizedPart, context as { ts: typeof tsModule; checker: TypeChecker; });

					if (
						isResolvable === false
						|| (isResolvable == null && type != null && (type.flags & context.ts.TypeFlags.Any) !== 0)
					)
						return JSON.stringify(trimmedPart);
				}

				return normalizedPart;
			})
			.join(' | ');
	}

	return expression;
}

function getPrimitiveJsDocType(expression: string, checker: TypeChecker): Type | undefined {
	switch (expression.trim().toLowerCase()) {
	case 'string':
		return checker.getStringType();
	case 'number':
		return checker.getNumberType();
	case 'boolean':
		return checker.getBooleanType();
	case 'any':
	case '*':
		return checker.getAnyType();
	case 'null':
		return checker.getNullType();
	case 'undefined':
		return checker.getUndefinedType();
	}

	return undefined;
}

/**
 * Converts a JSDoc type expression to a checker-backed Type.
 * @param str
 * @param context
 */
export function parseSimpleJsDocTypeExpression(
	str: string,
	context: { program: Program; ts: typeof tsModule; checker: TypeChecker; },
	tagNode?: JSDocTag,
	ownerNode?: Node,
	tagIndex = -1,
): Type | undefined {
	if (str == null)
		return context.checker.getAnyType();

	if (tagNode != null || ownerNode != null) {
		const typeExpression = tagNode != null && 'typeExpression' in tagNode
			? (tagNode as JSDocTypeTag).typeExpression.type
			: undefined;
		if (
			typeExpression != null &&
			!context.ts.isTypeLiteralNode(typeExpression) &&
			typeExpression.getText() === str &&
			!hasOverlappingDiagnostic(context.program, typeExpression)
		) {
			const type = context.checker.getTypeFromTypeNode(typeExpression);

			return isUnresolvedAny(type, str) ? undefined : type;
		}

		const owner = tagNode?.parent?.parent ?? ownerNode;
		const leadingComment = owner == null ? undefined : getLeadingCommentForNode(owner, context.ts);
		const commentStart = owner == null
			? undefined
			: context.ts.getLeadingCommentRanges(owner.getSourceFile().text, owner.pos)?.[0]?.pos;
		const resolvedTagIndex = tagNode != null && context.ts.isJSDoc(tagNode.parent)
			? tagNode.parent.tags?.indexOf(tagNode) ?? tagIndex
			: tagIndex;
		if (leadingComment != null && commentStart != null && resolvedTagIndex >= 0) {
			const virtualSourceFile = context.program.getSourceFile(`${ owner!.getSourceFile().fileName }.__lit_jsdoc__.d.ts`);
			const aliasName = `__lit_jsdoc_${ commentStart }_${ resolvedTagIndex }`;
			const alias = virtualSourceFile?.statements.find(
				(statement): statement is import('typescript').TypeAliasDeclaration =>
					context.ts.isTypeAliasDeclaration(statement) && statement.name.text === aliasName,
			);
			if (alias != null && !hasOverlappingDiagnostic(context.program, alias.type)) {
				const type = context.checker.getTypeAtLocation(alias.type);

				return isUnresolvedAny(type, str) ? undefined : type;
			}
		}
	}

	const primitiveType = getPrimitiveJsDocType(str, context.checker);
	if (primitiveType != null)
		return primitiveType;

	if (tagNode != null || ownerNode != null)
		return undefined;

	const type = parseTypeScriptTypeExpression(normalizeJsDocTypeExpression(str, context), context);

	return (type.flags & context.ts.TypeFlags.Any) !== 0 ? undefined : type;
}

function hasOverlappingDiagnostic(program: Program, node: Node): boolean {
	const sourceFile = node.getSourceFile();
	const nodeStart = node.getStart(sourceFile);
	const nodeEnd = node.getEnd();
	const diagnostics = [
		...program.getSyntacticDiagnostics(sourceFile),
		...program.getSemanticDiagnostics(sourceFile),
	];

	return diagnostics.some(diagnostic => {
		if (diagnostic.start == null || diagnostic.length == null)
			return false;

		const diagnosticEnd = diagnostic.start + diagnostic.length;

		return diagnostic.start < nodeEnd && diagnosticEnd > nodeStart;
	});
}

function isUnresolvedAny(type: Type, expression: string): boolean {
	return (type.flags & TypeFlags.Any) !== 0 && expression.trim().toLowerCase() !== 'any';
}

/**
 * Finds a @type jsdoc tag in the jsdoc and returns the corresponding simple type
 * @param jsDoc
 * @param context
 */
export function getJsDocType(
	jsDoc: JsDoc,
	context: { program: Program; ts: typeof tsModule; checker: TypeChecker; },
	ownerNode?: Node,
): Type | undefined {
	if (jsDoc.tags != null) {
		const typeTagIndex = jsDoc.tags.findIndex(t => t.tag === 'type');
		const typeJsDocTag = typeTagIndex < 0 ? undefined : jsDoc.tags[typeTagIndex];

		if (typeJsDocTag != null) {
			const parsedJsDoc = typeJsDocTag.parsed();

			if (parsedJsDoc.type != null)
				return parseSimpleJsDocTypeExpression(parsedJsDoc.type, context, typeJsDocTag.node, ownerNode, typeTagIndex);
		}
	}
}

const JSDOC_TAGS_WITH_REQUIRED_NAME: string[] = [ 'param', 'fires', '@element', '@customElement' ];

/**
 * Takes a string that represents a value in jsdoc and transforms it to a javascript value
 * @param value
 */
function parseJsDocValue(value: string | undefined): unknown {
	if (value == null)
		return value;


	// Parse quoted strings
	const quotedMatch = value.match(/^["'`](.*)["'`]$/);
	if (quotedMatch != null)
		return quotedMatch[1];


	// Parse keywords
	switch (value) {
	case 'false':
		return false;
	case 'true':
		return true;
	case 'undefined':
		return undefined;
	case 'null':
		return null;
	}

	// Parse number
	if (!isNaN(Number(value)))
		return Number(value);


	return value;
}

/**
 * Parses "@tag {type} name description" or "@tag name {type} description"
 * @param str
 */
function parseJsDocTagString(str: string): JsDocTagParsed {
	const jsDocTag: JsDocTagParsed = {
		tag: '',
	};

	if (str[0] !== '@')
		return jsDocTag;


	const moveStr = (byLength: string | number) => {
		str = str.substring(typeof byLength === 'number' ? byLength : byLength.length);
	};

	const unqouteStr = (quotedStr: string) => {
		return quotedStr.replace(/^['"](.+)["']$/, (_, match) => match);
	};

	const matchTag = () => {
		// Match tag
		// Example: "  @mytag"
		const tagResult = str.match(/^(\s*@(\S+))/);
		if (tagResult == null) {
			return jsDocTag;
		}
		else {
			// Move string to the end of the match
			// Example: "  @mytag|"
			moveStr(tagResult[1]);
			jsDocTag.tag = tagResult[2];
		}
	};

	const matchType = () => {
		// Match type
		// Example: "   {MyType}"
		const typeResult = str.match(/^(\s*{([\s\S]*)})/);
		if (typeResult != null) {
			// Move string to the end of the match
			// Example: "  {MyType}|"
			moveStr(typeResult[1]);
			jsDocTag.type = typeResult[2];
		}
	};

	const matchName = () => {
		// Match optional name
		// Example: "  [myname=mydefault]"
		const defaultNameResult = str.match(/^(\s*\[([\s\S]+)\])/);
		if (defaultNameResult != null) {
			// Move string to the end of the match
			// Example: "  [myname=mydefault]|"
			moveStr(defaultNameResult[1]);

			// Using [...] means that this doc is optional
			jsDocTag.optional = true;

			// Split the inner content between [...] into parts
			// Example:  "myname=mydefault" => "myname", "mydefault"
			const parts = defaultNameResult[2].split('=');
			if (parts.length === 2) {
				// Both name and default were given
				jsDocTag.name = unqouteStr(parts[0]);
				jsDocTag.default = parseJsDocValue(parts[1]);
			}
			else if (parts.length !== 0) {
				// No default was given
				jsDocTag.name = unqouteStr(parts[0]);
			}
		}
		else {
			// else, match required name
			// Example: "   myname"

			// A name is needed some jsdoc tags making it possible to include omit "-"
			// Therefore we don't look for "-" or line end if the name is required - in that case we only need to eat the first word to find the name.
			const regex = JSDOC_TAGS_WITH_REQUIRED_NAME
				.includes(jsDocTag.tag) ? /^(\s*(\S+))/ : /^(\s*(\S+))((\s*-[\s\S]+)|\s*)($|[\r\n])/;

			const nameResult = str.match(regex);
			if (nameResult != null) {
				// Move string to end of match
				// Example: "   myname|"
				moveStr(nameResult[1]);
				jsDocTag.name = unqouteStr(nameResult[2].trim());
			}
		}
	};

	const matchComment = () => {
		// Match comment
		if (str.length > 0) {
			// The rest of the string is parsed as comment. Remove "-" if needed.
			jsDocTag.description = str.replace(/^\s*-\s*/, '').trim() || undefined;
		}

		// Expand the name based on namespace and classname
		if (jsDocTag.name != null) {
			/**
			 * The name could look like this, so we need to parse and the remove the class name and namespace from the name
			 *   InputSwitch#[CustomEvent]input-switch-check-changed
			 *   InputSwitch#input-switch-check-changed
			 */
			const match = jsDocTag.name.match(/(.*)#(\[.*\])?(.*)/);
			if (match != null) {
				jsDocTag.className = match[1];
				jsDocTag.namespace = match[2];
				jsDocTag.name = match[3];
			}
		}
	};

	matchTag();
	matchType();
	matchName();

	// Type can come both before and after "name"
	if (jsDocTag.type == null)
		matchType();


	matchComment();

	return jsDocTag;
}

/**
 * Parses an entire jsdoc string
 * @param doc
 */
function parseJsDocString(doc: string): JsDoc | undefined {
	// Prepare lines
	const lines = doc.split('\n').map(line => line.trim());
	let description = '';
	let readDescription = true;
	let currentTag = '';
	const tags: JsDocTag[] = [];

	/**
	 * Parsing will add to "currentTag" and commit it when necessary
	 */
	const commitCurrentTag = () => {
		if (currentTag.length > 0) {
			const tagToCommit = currentTag;

			const tagMatch = tagToCommit.match(/^@(\S+)\s*/);

			if (tagMatch != null) {
				tags.push({
					parsed:  lazy(() => parseJsDocTagString(tagToCommit)),
					node:    undefined,
					tag:     tagMatch[1],
					comment: tagToCommit.substr(tagMatch[0].length),
				});
			}

			currentTag = '';
		}
	};

	// Parse all lines one by one
	for (const line of lines) {
		// Don't parse the last line ("*/")
		if (line.match(/\*\//))
			continue;


		// Match a line like: "* @mytag description"
		const tagCommentMatch = line.match(/(^\s*\*\s*)@\s*/);
		if (tagCommentMatch != null) {
			// Commit current tag (if any has been read). Now "currentTag" will reset.
			commitCurrentTag();
			// Add everything on the line from "@"
			currentTag += line.substr(tagCommentMatch[1].length);
			// We hit a jsdoc tag, so don't read description anymore
			readDescription = false;
		}
		else if (!readDescription) {
			// If we are not reading the description, we are currently reading a multiline tag
			const commentMatch = line.match(/^\s*\*\s*/);
			if (commentMatch != null)
				currentTag += '\n' + line.substr(commentMatch[0].length);
		}
		else {
			// Read everything after "*" into the description if we are currently reading the description

			// If we are on the first line, add everything after "/*"
			const startLineMatch = line.match(/^\s*\/\*\*/);
			if (startLineMatch != null)
				description += line.substr(startLineMatch[0].length);


			// Add everything after "*" into the current description
			const commentMatch = line.match(/^\s*\*\s*/);
			if (commentMatch != null) {
				if (description.length > 0)
					description += '\n';

				description += line.substr(commentMatch[0].length);
			}
		}
	}

	// Commit a tag if we were currently parsing one
	commitCurrentTag();

	if (description.length === 0 && tags.length === 0)
		return undefined;


	return {
		description: unescapeJSDoc(description),
		tags,
	};
}

/**
 * Certain characters as "@" can be escaped in order to prevent Typescript from
 * parsing it as a jsdoc tag. This function unescapes these characters.
 * @param str
 */
function unescapeJSDoc(str: string): string {
	return str.replace(/\\@/, '@');
}
