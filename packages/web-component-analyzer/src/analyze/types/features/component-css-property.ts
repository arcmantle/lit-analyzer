import { ComponentFeatureBase } from "./component-feature.js";

export interface ComponentCssProperty extends ComponentFeatureBase {
	name: string;
	typeHint?: string;
	default?: unknown;
}
