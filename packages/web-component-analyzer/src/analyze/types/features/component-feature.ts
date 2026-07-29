import { ComponentDeclaration } from "../component-declaration.js";
import { JsDoc } from "../js-doc.js";

export type ComponentFeature = "member" | "method" | "cssproperty" | "csspart" | "event" | "slot";

export const ALL_COMPONENT_FEATURES: ComponentFeature[] = ["member", "method", "cssproperty", "csspart", "event", "slot"];

export interface ComponentFeatureBase {
	jsDoc?: JsDoc;
	declaration?: ComponentDeclaration;
}
