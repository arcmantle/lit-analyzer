import { AnalyzerFlavor } from "../analyzer-flavor.js";
import { discoverDefinitions } from "./discover-definitions.js";
import { discoverFeatures } from "./discover-features.js";
import { discoverGlobalFeatures } from "./discover-global-features.js";
import { refineDeclaration } from "./refine-declaration.js";
import { refineFeature } from "./refine-feature.js";

/**
 * Flavors for analyzing jsdoc related features
 */
export class JsDocFlavor implements AnalyzerFlavor {
	discoverDefinitions = discoverDefinitions;

	discoverFeatures = discoverFeatures;

	discoverGlobalFeatures = discoverGlobalFeatures;

	refineFeature = refineFeature;

	refineDeclaration = refineDeclaration;
}
