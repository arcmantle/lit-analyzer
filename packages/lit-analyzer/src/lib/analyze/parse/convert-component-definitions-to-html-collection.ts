import type { Program, Type, TypeChecker } from 'typescript';
import type tsModule from 'typescript';
import type { ComponentMember } from '@arcmantle/web-component-analyzer';
import { AnalyzerResult, ComponentDeclaration, ComponentDefinition, ComponentFeatures } from '@arcmantle/web-component-analyzer';

import { litAttributeNameFromDeclarationMap } from './lit-attribute-name-from-declaration-map.js';
import { HtmlDataCollection, HtmlDataFeatures, type HtmlProp, HtmlTag } from './parse-html-data/html-tag.js';

export interface AnalyzeResultConversionOptions {
	addDeclarationPropertiesAsAttributes?: boolean;
	program?:                              Program;
	ts?:                                   typeof tsModule;
}

export function convertAnalyzeResultToHtmlCollection(
	result: AnalyzerResult,
	options: AnalyzeResultConversionOptions,
): HtmlDataCollection {
	const tags = result.componentDefinitions.map(definition =>
		convertComponentDeclarationToHtmlTag(definition.declaration, definition, options));

	const global = result.globalFeatures == null
		? {}
		: convertComponentFeaturesToHtml(result.globalFeatures, {});

	return {
		tags,
		global,
	};
}

export function convertComponentDeclarationToHtmlTag(
	declaration: ComponentDeclaration | undefined,
	definition: ComponentDefinition | undefined,
	{ addDeclarationPropertiesAsAttributes, program, ts }: AnalyzeResultConversionOptions,
): HtmlTag {
	const tagName = definition?.tagName ?? '';

	const builtIn = definition == null || (declaration?.sourceFile || definition.sourceFile).fileName.endsWith('lib.dom.d.ts');

	if (declaration == null) {
		return {
			tagName,
			builtIn,
			attributes:    [],
			events:        [],
			properties:    [],
			slots:         [],
			cssParts:      [],
			cssProperties: [],
		};
	}

	const htmlTag: HtmlTag = {
		declaration,
		tagName,
		builtIn,
		description: declaration.jsDoc?.description,
		...convertComponentFeaturesToHtml(declaration, { builtIn, declaration, fromTagName: tagName }),
	};

	if (addDeclarationPropertiesAsAttributes && !builtIn) {
		for (const htmlProp of htmlTag.properties) {
			if (
				htmlProp.declaration != null
				&& htmlProp.declaration.attrName == null
				&& htmlProp.declaration.node.getSourceFile().isDeclarationFile
			) {
				const configuredAttributeName = program == null || ts == null
					? undefined
					: litAttributeNameFromDeclarationMap(htmlProp.declaration, program, ts);
				if (configuredAttributeName === false)
					continue;

				htmlTag.attributes.push({
					...htmlProp,
					kind: 'attribute',
					name: configuredAttributeName ?? htmlProp.name,
				});
			}
		}
	}

	return htmlTag;
}

export function convertComponentFeaturesToHtml(
	features: ComponentFeatures,
	{ builtIn, declaration, fromTagName }: { builtIn?: boolean; declaration?: ComponentDeclaration; fromTagName?: string; },
): HtmlDataFeatures {
	const result: HtmlDataFeatures = {
		attributes:    [],
		events:        [],
		properties:    [],
		slots:         [],
		cssParts:      [],
		cssProperties: [],
	};

	for (const event of features.events) {
		result.events.push({
			declaration: event,
			description: event.jsDoc?.description,
			name:        event.name,
			getType:     checker => {
				const type = event.type?.(checker);

				if (type == null)
					return checker.getAnyType();

				return type;
			},
			fromTagName,
			builtIn,
		});

		result.attributes.push({
			kind:        'attribute',
			name:        `on${ event.name }`,
			description: event.jsDoc?.description,
			getType:     checker => checker.getStringType(),
			declaration: {
				attrName: `on${ event.name }`,
				jsDoc:    event.jsDoc,
				kind:     'attribute',
				node:     event.node,
				type:     checker => checker.getAnyType(),
			},
			builtIn,
			fromTagName,
		});
	}

	for (const cssPart of features.cssParts) {
		result.cssParts.push({
			declaration: cssPart,
			description: cssPart.jsDoc?.description,
			name:        cssPart.name || '',
			fromTagName,
		});
	}

	for (const cssProp of features.cssProperties) {
		result.cssProperties.push({
			declaration: cssProp,
			description: cssProp.jsDoc?.description,
			name:        cssProp.name || '',
			typeHint:    cssProp.typeHint,
			fromTagName,
		});
	}

	for (const slot of features.slots) {
		result.slots.push({
			declaration: slot,
			description: slot.jsDoc?.description,
			name:        slot.name || '',
			fromTagName,
		});
	}

	for (const member of features.members) {
		// Only add public members
		if (member.visibility != null && member.visibility !== 'public')
			continue;

		// Only add non-static members
		if (member.modifiers?.has('static'))
			continue;

		// Only add writable members
		if (member.modifiers?.has('readonly'))
			continue;

		const base = {
			declaration: member,
			description: member.jsDoc?.description,
			getType:     checker => getMemberType(member, declaration, checker),
			builtIn,
			fromTagName,
		} satisfies Partial<HtmlProp>;

		if (member.kind === 'property') {
			result.properties.push({
				...base,
				kind:     'property',
				name:     member.propName,
				required: member.required,
			});
		}

		if ('attrName' in member && member.attrName != null) {
			result.attributes.push({
				...base,
				kind:     'attribute',
				name:     member.attrName,
				required: member.required,
			});
		}
	}

	return result;
}

function getMemberType(member: ComponentMember, declaration: ComponentDeclaration | undefined, checker: TypeChecker): Type {
	if (member.kind === 'property' && declaration?.symbol != null) {
		const declarationType = checker.getDeclaredTypeOfSymbol(declaration.symbol);
		const memberSymbol = checker.getPropertyOfType(declarationType, member.propName);
		if (memberSymbol != null)
			return checker.getTypeOfSymbolAtLocation(memberSymbol, declaration.node);
	}

	return member.type?.(checker) ?? checker.getAnyType();
}
