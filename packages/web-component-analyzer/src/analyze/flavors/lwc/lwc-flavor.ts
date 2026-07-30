import { AnalyzerFlavor } from '../analyzer-flavor.js';
import { discoverDefinitions } from './discover-definitions.js';
import { discoverMembers } from './discover-members.js';
import { refineFeature } from './refine-feature.js';

/**
 * Flavors for analyzing LWC related features: https://lwc.dev/
 */
export class LwcFlavor implements AnalyzerFlavor {

	discoverDefinitions = discoverDefinitions;
	discoverFeatures = {
		member: discoverMembers,
	};

	refineFeature = refineFeature;

}
