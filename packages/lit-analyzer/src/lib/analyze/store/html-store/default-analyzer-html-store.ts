import {
	HtmlAttr,
	HtmlAttrTarget,
	HtmlCssPart,
	HtmlDataCollection,
	HtmlEvent,
	HtmlMember,
	HtmlProp,
	HtmlSlot,
	HtmlTag,
	NamedHtmlDataCollection,
} from '../../parse/parse-html-data/html-tag.js';
import {
	HtmlNodeAttr,
	HtmlNodeAttrKind,
	IHtmlNodeAttr,
	IHtmlNodeAttrEventListener,
	IHtmlNodeAttrProp,
	IHtmlNodeBooleanAttribute,
} from '../../types/html-node/html-node-attr-types.js';
import { HtmlNode } from '../../types/html-node/html-node-types.js';
import { AnalyzerHtmlStore } from '../analyzer-html-store.js';
import { HtmlDataSourceKind, HtmlDataSourceMerged } from './html-data-source-merged.js';

export class DefaultAnalyzerHtmlStore implements AnalyzerHtmlStore {

	private dataSource = new HtmlDataSourceMerged();

	/** Called with the tag name before every read, so an owner can refresh it first. */
	beforeTagRead: ((tagName: string) => void) | undefined;

	private tagNameOf(htmlNode: HtmlNode | string): string {
		const tagName = typeof htmlNode === 'string' ? htmlNode : htmlNode.tagName;
		this.beforeTagRead?.(tagName);

		return tagName;
	}

	absorbSubclassExtension(name: string, extension: HtmlTag): void {
		this.dataSource.absorbSubclassExtension(name, extension);
	}

	absorbCollection(collection: HtmlDataCollection, register: HtmlDataSourceKind): void {
		this.dataSource.absorbCollection(collection, register);
	}

	forgetCollection(collection: NamedHtmlDataCollection, register: HtmlDataSourceKind): void {
		this.dataSource.forgetCollection(collection, register);
	}

	getHtmlTag(htmlNode: HtmlNode | string): HtmlTag | undefined {
		return this.dataSource.getHtmlTag(this.tagNameOf(htmlNode));
	}

	getGlobalTags(): Iterable<HtmlTag> {
		return this.dataSource.globalTags.values();
	}

	getAllAttributesForTag(htmlNode: HtmlNode | string): Iterable<HtmlAttr> {
		return this.dataSource.getAllAttributesForTag(this.tagNameOf(htmlNode)).values();
	}

	getAllPropertiesForTag(htmlNode: HtmlNode | string): Iterable<HtmlProp> {
		return this.dataSource.getAllPropertiesForTag(this.tagNameOf(htmlNode)).values();
	}

	getAllEventsForTag(htmlNode: HtmlNode | string): Iterable<HtmlEvent> {
		return this.dataSource.getAllEventsForTag(this.tagNameOf(htmlNode)).values();
	}

	getAllSlotsForTag(htmlNode: HtmlNode | string): Iterable<HtmlSlot> {
		return this.dataSource.getAllSlotForTag(this.tagNameOf(htmlNode)).values();
	}

	getAllCssPartsForTag(htmlNode: HtmlNode | string): Iterable<HtmlCssPart> {
		return this.dataSource.getAllCssPartsForTag(this.tagNameOf(htmlNode)).values();
	}

	getAllCssPropertiesForTag(htmlNode: HtmlNode | string): Iterable<HtmlCssPart> {
		return this.dataSource.getAllCssPropertiesForTag(this.tagNameOf(htmlNode)).values();
	}

	getHtmlAttrTarget(htmlNodeAttr: IHtmlNodeAttrProp): HtmlProp | undefined;
	getHtmlAttrTarget(htmlNodeAttr: IHtmlNodeAttr | IHtmlNodeBooleanAttribute): HtmlAttr | undefined;
	getHtmlAttrTarget(htmlNodeAttr: IHtmlNodeAttr | IHtmlNodeBooleanAttribute | IHtmlNodeAttrProp): HtmlMember | undefined;
	getHtmlAttrTarget(htmlNodeAttr: IHtmlNodeAttrEventListener): HtmlEvent | undefined;
	getHtmlAttrTarget(htmlNodeAttr: HtmlNodeAttr): HtmlAttrTarget | undefined;
	getHtmlAttrTarget(htmlNodeAttr: HtmlNodeAttr): HtmlAttrTarget | undefined {
		const name = htmlNodeAttr.name.toLowerCase();

		switch (htmlNodeAttr.kind) {
		case HtmlNodeAttrKind.EVENT_LISTENER:
			return this.dataSource.getAllEventsForTag(this.tagNameOf(htmlNodeAttr.htmlNode)).get(name);

		case HtmlNodeAttrKind.BOOLEAN_ATTRIBUTE:
		case HtmlNodeAttrKind.ATTRIBUTE:
			return this.dataSource.getAllAttributesForTag(this.tagNameOf(htmlNodeAttr.htmlNode)).get(name);

		case HtmlNodeAttrKind.PROPERTY:
			return this.dataSource.getAllPropertiesForTag(this.tagNameOf(htmlNodeAttr.htmlNode)).get(name);
		}
	}

}
