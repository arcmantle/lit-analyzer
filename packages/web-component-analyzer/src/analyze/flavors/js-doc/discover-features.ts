import { Node, Type } from 'typescript';

import { AnalyzerVisitContext } from '../../analyzer-visit-context.js';
import { ComponentCssPart } from '../../types/features/component-css-part.js';
import { ComponentCssProperty } from '../../types/features/component-css-property.js';
import { ComponentEvent } from '../../types/features/component-event.js';
import { ComponentMember, ComponentMemberAttribute, ComponentMemberProperty } from '../../types/features/component-member.js';
import { ComponentSlot } from '../../types/features/component-slot.js';
import { getNodeSourceFileLang } from '../../util/ast-util.js';
import { parseSimpleJsDocTypeExpression } from '../../util/js-doc-util.js';
import { FeatureDiscoverVisitMap } from '../analyzer-flavor.js';
import { parseJsDocForNode } from './parse-js-doc-for-node.js';

export const discoverFeatures: Partial<FeatureDiscoverVisitMap<AnalyzerVisitContext>> = {
	csspart: (node: Node, context: AnalyzerVisitContext): ComponentCssPart[] | undefined => {
		if (context.ts.isInterfaceDeclaration(node) || context.ts.isClassDeclaration(node)) {
			return parseJsDocForNode(
				node,
				[ 'csspart' ],
				(tagNode, { name, description }) => {
					if (name != null && name.length > 0) {
						return {
							name:  name,
							jsDoc: description != null ? { description } : undefined,
						};
					}
				},
				context,
			);
		}
	},
	cssproperty: (node: Node, context: AnalyzerVisitContext): ComponentCssProperty[] | undefined => {
		if (context.ts.isInterfaceDeclaration(node) || context.ts.isClassDeclaration(node)) {
			return parseJsDocForNode(
				node,
				[ 'cssprop', 'cssproperty', 'cssvar', 'cssvariable' ],
				(tagNode, { name, description, type, default: def }) => {
					if (name != null && name.length > 0) {
						return {
							name:     name,
							jsDoc:    description != null ? { description } : undefined,
							typeHint: type || undefined,
							default:  def,
						};
					}
				},
				context,
			);
		}
	},
	event: (node: Node, context: AnalyzerVisitContext): ComponentEvent[] | undefined => {
		if (context.ts.isInterfaceDeclaration(node) || context.ts.isClassDeclaration(node)) {
			return parseJsDocForNode(
				node,
				[ 'event', 'fires', 'emits' ],
				(tagNode, { name, description, type }, tagIndex) => {
					if (name != null && name.length > 0) {
						// Resolved here, not on read, because a jsdoc type comes from the tag text, not from a node.
						const jsDocType = type != null
							? parseSimpleJsDocTypeExpression(type, context, tagNode, node, tagIndex)
							: undefined;

						return {
							name:     name,
							jsDoc:    description != null ? { description } : undefined,
							type:     jsDocType == null ? undefined : () => jsDocType,
							typeHint: type,
							node:     tagNode ?? node,
						};
					}
				},
				context,
			);
		}
	},
	slot: (node: Node, context: AnalyzerVisitContext): ComponentSlot[] | undefined => {
		if (context.ts.isInterfaceDeclaration(node) || context.ts.isClassDeclaration(node)) {
			return parseJsDocForNode(
				node,
				[ 'slot' ],
				(tagNode, { name, type, description }, tagIndex) => {
					// Treat "-" as unnamed slot
					if (name === '-')
						name = undefined;

					// Grab the type from jsdoc and use it to find permitted tag names
					// Example: @slot {"div"|"span"} myslot
					const permittedTagNameType = type == null
						? undefined
						: parseSimpleJsDocTypeExpression(type, context, tagNode, node, tagIndex);
					const permittedTagNames: string[] | undefined = (() => {
						if (permittedTagNameType == null)
							return undefined;

						const stringLiterals = (type: Type): string[] => {
							if (type.isStringLiteral())
								return [ type.value ];

							if (type.isUnion())
								return type.types.flatMap(stringLiterals);

							return [];
						};

						const values = stringLiterals(permittedTagNameType);

						return values.length > 0 ? values : undefined;
					})();

					return {
						name:  name,
						jsDoc: description != null ? { description } : undefined,
						permittedTagNames,
					};
				},
				context,
			);
		}
	},
	member: (node: Node, context: AnalyzerVisitContext): ComponentMember[] | undefined => {
		if (context.ts.isInterfaceDeclaration(node) || context.ts.isClassDeclaration(node)) {
			const priority = getNodeSourceFileLang(node) === 'js' ? 'high' : 'medium';

			const properties = parseJsDocForNode(
				node,
				[ 'prop', 'property' ],
				(tagNode, { name, default: def, type, description }, tagIndex) => {
					if (name != null && name.length > 0) {
						const jsDocType = type == null
							? undefined
							: parseSimpleJsDocTypeExpression(type, context, tagNode, node, tagIndex);

						return {
							priority,
							kind:       'property',
							propName:   name,
							jsDoc:      description != null ? { description } : undefined,
							typeHint:   type,
							type:       jsDocType == null ? undefined : () => jsDocType,
							node:       tagNode ?? node,
							default:    def,
							visibility: undefined,
							reflect:    undefined,
							required:   undefined,
							deprecated: undefined,
						} satisfies ComponentMemberProperty;
					}
				},
				context,
			);

			const attributes = parseJsDocForNode(
				node,
				[ 'attr', 'attribute' ],
				(tagNode, { name, default: def, type, description }, tagIndex) => {
					if (name != null && name.length > 0) {
						const jsDocType = type == null
							? context.checker.getStringType()
							: parseSimpleJsDocTypeExpression(type, context, tagNode, node, tagIndex);

						return {
							priority,
							kind:       'attribute',
							attrName:   name,
							jsDoc:      description != null ? { description } : undefined,
							type:       jsDocType == null ? undefined : () => jsDocType,
							typeHint:   type,
							node:       tagNode ?? node,
							default:    def,
							visibility: undefined,
							reflect:    undefined,
							required:   undefined,
							deprecated: undefined,
						} as ComponentMemberAttribute;
					}
				},
				context,
			);

			if (attributes != null || properties != null)
				return [ ...(attributes || []), ...(properties || []) ];


			return undefined;
		}
	},
};
