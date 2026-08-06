import { existsSync, readFileSync } from 'fs';
import { TypeChecker } from 'typescript';
import { HTMLDataV1 } from 'vscode-html-languageservice';

import { LitAnalyzerConfig } from '../lit-analyzer-config.js';
import {
	HtmlAttr,
	HtmlDataCollection,
	HtmlEvent,
	HtmlTag,
	mergeHtmlAttrs,
	mergeHtmlEvents,
	mergeHtmlTags,
} from '../parse/parse-html-data/html-tag.js';
import { parseVscodeHtmlData } from '../parse/parse-html-data/parse-vscode-html-data.js';

export function getUserConfigHtmlCollection(config: LitAnalyzerConfig, checker: TypeChecker): HtmlDataCollection {
	const collection = (() => {
		let collection: HtmlDataCollection = { tags: [], global: {} };
		for (const customHtmlData of Array.isArray(config.customHtmlData) ? config.customHtmlData : [ config.customHtmlData ]) {
			try {
				const data: HTMLDataV1 =
					typeof customHtmlData === 'string' && existsSync(customHtmlData)
						? JSON.parse(readFileSync(customHtmlData, 'utf8').toString())
						: customHtmlData;
				const parsedCollection = parseVscodeHtmlData(data);
				collection = {
					tags:   mergeHtmlTags([ ...collection.tags, ...parsedCollection.tags ]),
					global: {
						attributes: mergeHtmlAttrs([
							...(collection.global.attributes || []),
							...(parsedCollection.global.attributes || []),
						]),
						events: mergeHtmlEvents([ ...(collection.global.events || []), ...(parsedCollection.global.events || []) ]),
					},
				};
			}
			catch (e) {
				//logger.error("Error parsing user configuration 'customHtmlData'", e, customHtmlData);
			}
		}

		return collection;
	})();

	const tags = config.globalTags.map(
		tagName =>
			({
				tagName:       tagName,
				properties:    [],
				attributes:    [],
				events:        [],
				slots:         [],
				cssParts:      [],
				cssProperties: [],
			} as HtmlTag),
	);

	const attrs = config.globalAttributes.map(
		attrName =>
			({
				name:    attrName,
				kind:    'attribute',
				getType: checker => checker.getAnyType(),
			} as HtmlAttr),
	);

	const events = config.globalEvents.map(
		eventName =>
			({
				name:    eventName,
				kind:    'event',
				getType: checker => checker.getAnyType(),
			} as HtmlEvent),
	);

	return {
		tags:   [ ...tags, ...collection.tags ],
		global: {
			attributes: [ ...attrs, ...(collection.global.attributes || []) ],
			events:     [ ...events, ...(collection.global.events || []) ],
		},
	};
}
