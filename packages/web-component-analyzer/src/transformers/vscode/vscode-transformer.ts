import { Program, Type, TypeChecker, TypeFlags } from 'typescript';

import { AnalyzerResult } from '../../analyze/types/analyzer-result.js';
import { ComponentDefinition } from '../../analyze/types/component-definition.js';
import { ComponentEvent } from '../../analyze/types/features/component-event.js';
import { ComponentMember } from '../../analyze/types/features/component-member.js';
import { JsDoc } from '../../analyze/types/js-doc.js';
import { arrayDefined } from '../../util/array-util.js';
import { markdownHighlight } from '../markdown/markdown-util.js';
import { TransformerConfig } from '../transformer-config.js';
import { TransformerFunction } from '../transformer-function.js';
import { HtmlDataAttr, HtmlDataAttrValue, HtmlDataTag, VscodeHtmlData } from './vscode-html-data.js';

/**
 * Vscode json output format transformer.
 * @param results
 * @param program
 * @param config
 */
export const vscodeTransformer: TransformerFunction = (
	results: AnalyzerResult[],
	program: Program,
	config: TransformerConfig,
): string => {
	const checker = program.getTypeChecker();

	// Grab all definitions
	const definitions = results.map(res => res.componentDefinitions).reduce((acc, cur) => [ ...acc, ...cur ], []);

	// Transform all definitions into "tags"
	const tags = definitions.map(d => definitionToHtmlDataTag(d, checker));

	const vscodeJson: VscodeHtmlData = {
		version:          1,
		tags,
		globalAttributes: [],
		valueSets:        [],
	};

	return JSON.stringify(vscodeJson, null, 2);
};

function definitionToHtmlDataTag(definition: ComponentDefinition, checker: TypeChecker): HtmlDataTag {
	const declaration = definition.declaration;

	if (declaration == null) {
		return {
			name:       definition.tagName,
			attributes: [],
		};
	}

	// Transform all members into "attributes"
	const customElementAttributes = arrayDefined(declaration.members.map(d => componentMemberToVscodeAttr(d, checker)));
	const eventAttributes = arrayDefined(declaration.events.map(e => componentEventToVscodeAttr(e, checker)));

	const attributes = [ ...customElementAttributes, ...eventAttributes ];

	return {
		name:        definition.tagName,
		description: formatMetadata(declaration.jsDoc, {
			Events: declaration.events.map(e => formatEntryRow(e.name, e.jsDoc, e.type?.(checker), checker)),
			Slots:  declaration.slots.map(s => formatEntryRow(
				s.name || ' ', s.jsDoc,
				s.permittedTagNames && s.permittedTagNames.map(n => `"${ markdownHighlight(n) }"`).join(' | '),
				checker,
			)),
			Attributes: declaration.members
				.map(m => ('attrName' in m && m.attrName != null
					? formatEntryRow(m.attrName, m.jsDoc, m.typeHint || m.type?.(checker), checker)
					: undefined))
				.filter(m => m != null),
			Properties: declaration.members
				.map(m => ('propName' in m && m.propName != null
					? formatEntryRow(m.propName, m.jsDoc, m.typeHint || m.type?.(checker), checker)
					: undefined))
				.filter(m => m != null),
		}),
		attributes,
	};
}

function componentEventToVscodeAttr(event: ComponentEvent, checker: TypeChecker): HtmlDataAttr | undefined {
	return {
		name:        `on${ event.name }`,
		description: formatEntryRow(event.name, event.jsDoc, event.type?.(checker), checker),
	};
}

function componentMemberToVscodeAttr(member: ComponentMember, checker: TypeChecker): HtmlDataAttr | undefined {
	if (member.attrName == null)
		return undefined;


	return {
		name:        member.attrName,
		description: formatMetadata(formatEntryRow(
			member.attrName,
			member.jsDoc,
			member.typeHint || member.type?.(checker),
			checker,
		), {
			Property: 'propName' in member ? member.propName : undefined,
			Default:  member.default === undefined ? undefined : String(member.default),
		}),
		...((member.type && typeToVscodeValuePart(member.type(checker), checker)) || {}),
	};
}

/**
 * Converts a type to either a value set or string unions.
 * @param type
 * @param checker
 */
function typeToVscodeValuePart(
	type: Type,
	checker: TypeChecker,
): { valueSet: 'v'; } | { values: HtmlDataAttrValue[]; } | undefined {
	if ((type.flags & TypeFlags.BooleanLiteral) !== 0)
		return { values: [ { name: checker.typeToString(type) } ] };

	if ((type.flags & TypeFlags.BooleanLike) !== 0)
		return { valueSet: 'v' };

	if (type.isStringLiteral())
		return { values: [ { name: type.value } ] };

	if (type.isUnion())
		return { values: typesToStringUnion(type.types, checker) };

	return undefined;
}

/**
 * Returns a list of strings that represents the types.
 * Only looks at literal types and strips the rest.
 * @param types
 */
function typesToStringUnion(types: readonly Type[], checker: TypeChecker): HtmlDataAttrValue[] {
	return arrayDefined(
		types.map(t => {
			if ((t.flags & TypeFlags.BooleanLiteral) !== 0)
				return { name: checker.typeToString(t) };

			if (t.isStringLiteral() || t.isNumberLiteral())
				return { name: t.value.toString() };

			return undefined;
		}),
	);
}

/**
 * Formats description and metadata so that it can be used in documentation.
 * @param doc
 * @param metadata
 */
function formatMetadata(
	doc: string | undefined | JsDoc,
	metadata: { [key: string]: string | undefined | (string | undefined)[]; },
): string | undefined {
	const metaText = arrayDefined(
		Object.entries(metadata).map(([ key, value ]) => {
			if (value == null) {
				return undefined;
			}
			else if (Array.isArray(value)) {
				const filtered = arrayDefined(value);
				if (filtered.length === 0)
					return undefined;

				return `${ key }:\n\n${ filtered.map(v => `  * ${ v }`).join(`\n\n`) }`;
			}
			else {
				return `${ key }: ${ value }`;
			}
		}),
	).join(`\n\n`);

	const comment = typeof doc === 'string' ? doc : doc?.description || '';

	return `${ comment || '' }${ metadata ? `${ comment ? `\n\n` : '' }${ metaText }` : '' }` || undefined;
}

/**
 * Formats name, doc and type so that it can be presented in documentation
 * @param name
 * @param doc
 * @param type
 * @param checker
 */
function formatEntryRow(
	name: string,
	doc: JsDoc | string | undefined,
	type: Type | string | undefined,
	checker: TypeChecker,
): string {
	const comment = typeof doc === 'string' ? doc : doc?.description || '';
	const typeText = typeof type === 'string' ? type : type == null ? '' : formatType(type, checker);

	return `${ markdownHighlight(name) }${ typeText == null ? '' : ` {${ typeText }}` }`
		+ `${ comment == null ? '' : ' - ' }${ comment || '' }`;
}

/**
 * Formats a type to present in documentation
 * @param type
 * @param checker
 */
function formatType(type: Type, checker: TypeChecker): string | undefined {
	return (type.flags & TypeFlags.Any) === 0 ? markdownHighlight(checker.typeToString(type)) : undefined;
}
