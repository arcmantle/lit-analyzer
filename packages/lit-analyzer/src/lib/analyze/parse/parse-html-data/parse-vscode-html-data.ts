import { Type, TypeChecker } from 'typescript';
import { HTMLDataV1, IAttributeData, ITagData, IValueData, IValueSet } from 'vscode-html-languageservice';
import { MarkupContent } from 'vscode-languageserver-types';
import { getUnionType } from 'web-component-analyzer';

import { HtmlAttr, HtmlDataCollection, HtmlEvent, HtmlTag } from './html-tag.js';

export interface ParseVscodeHtmlDataConfig {
	builtIn?: boolean;
	typeMap?: Map<string, TypeFactory>;
}

export type TypeFactory = (checker: TypeChecker) => Type;

export function parseVscodeHtmlData(data: HTMLDataV1, config: ParseVscodeHtmlDataConfig = {}): HtmlDataCollection {
	switch (data.version) {
	case 1:
	case 1.1:
		return parseVscodeDataV1(data, config);
	}
}

function parseVscodeDataV1(data: HTMLDataV1, config: ParseVscodeHtmlDataConfig): HtmlDataCollection {
	const valueSetTypeMap = valueSetsToTypeMap(data.valueSets || []);
	valueSetTypeMap.set('v', checker => checker.getBooleanType());

	// Transfer existing typemap to new typemap
	if (config.typeMap != null) {
		for (const [ k, v ] of config.typeMap.entries())
			valueSetTypeMap.set(k, v);
	}

	const newConfig = {
		...config,
		typeMap: valueSetTypeMap,
	};

	const globalAttributes = (data.globalAttributes || []).map(tagDataAttr => tagDataToHtmlTagAttr(tagDataAttr, newConfig));

	const globalEvents = attrsToEvents(globalAttributes).map(evt => ({ ...evt, global: true }));

	return {
		tags:   (data.tags || []).map(tagData => tagDataToHtmlTag(tagData, newConfig)),
		global: {
			attributes: globalAttributes,
			events:     globalEvents,
		},
	};
}

function tagDataToHtmlTag(tagData: ITagData, config: ParseVscodeHtmlDataConfig): HtmlTag {
	const { name, description } = tagData;

	const attributes = tagData.attributes.map(tagDataAttr => tagDataToHtmlTagAttr(tagDataAttr, config, name));

	const events = attrsToEvents(attributes);

	return {
		tagName:       name,
		description:   stringOrMarkupContentToString(description),
		attributes,
		events,
		properties:    [],
		slots:         [],
		builtIn:       config.builtIn,
		cssParts:      [],
		cssProperties: [],
	};
}

function tagDataToHtmlTagAttr(tagDataAttr: IAttributeData, config: ParseVscodeHtmlDataConfig, fromTagName?: string): HtmlAttr {
	const { name, description, valueSet, values } = tagDataAttr;

	const type = valueSet != null ? config.typeMap?.get(valueSet) : values != null ? attrValuesToUnion(values) : undefined;

	return {
		kind:        'attribute',
		name,
		description: stringOrMarkupContentToString(description),
		fromTagName,
		getType:     checker => type == null ? checker.getAnyType() : type(checker),
		builtIn:     config.builtIn,
	};
}

function valueSetsToTypeMap(valueSets: IValueSet[]): Map<string, TypeFactory> {
	const entries = valueSets.map(valueSet => [ valueSet.name, attrValuesToUnion(valueSet.values) ] as [string, TypeFactory]);

	return new Map(entries);
}

function attrValuesToUnion(attrValues: IValueData[]): TypeFactory {
	return checker => getUnionType(checker, attrValues.map(value => checker.getStringLiteralType(value.name)));
}

function stringOrMarkupContentToString(str: string | MarkupContent | undefined): string | undefined {
	if (str == null || typeof str === 'string')
		return str;


	return str.value;
}

function attrsToEvents(htmlAttrs: HtmlAttr[]): HtmlEvent[] {
	return htmlAttrs
		.filter(htmlAttr => htmlAttr.name.startsWith('on'))
		.map(htmlAttr => ({
			name:        htmlAttr.name.replace(/^on/, ''),
			description: htmlAttr.description,
			fromTagName: htmlAttr.fromTagName,
			getType:     checker => checker.getAnyType(),
			builtIn:     htmlAttr.builtIn,
		}));
}
