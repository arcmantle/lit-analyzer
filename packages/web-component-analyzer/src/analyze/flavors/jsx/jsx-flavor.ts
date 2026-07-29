import { AnalyzerFlavor } from "../analyzer-flavor.js";
import { discoverDefinitions } from "./discover-definitions.js";
import { discoverGlobalFeatures } from "./discover-global-features.js";

/**
 * Flavors for analyzing jsx related features
 */
export class JSXFlavor implements AnalyzerFlavor {
	discoverDefinitions = discoverDefinitions;

	discoverGlobalFeatures = discoverGlobalFeatures;
}
