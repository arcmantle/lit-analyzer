import { ComponentFeatureBase } from "./component-feature.js";

export interface ComponentSlot extends ComponentFeatureBase {
	name?: string;
	permittedTagNames?: string[];
}
