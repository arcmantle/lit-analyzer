import { AnalyzerFlavor } from '../analyzer-flavor.js';
import { discoverDefinitions } from './discover-definitions.js';
import { discoverMembers } from './discover-members.js';
import { excludeNode } from './exclude-node.js';
import { refineFeature } from './refine-feature.js';

/**
 * Flavors for analyzing LitElement related features: https://lit-element.polymer-project.org/
 */
export class LitElementFlavor implements AnalyzerFlavor {

	excludeNode = excludeNode;

	discoverDefinitions = discoverDefinitions;

	discoverFeatures = {
		member: discoverMembers,
	};

	refineFeature = refineFeature;

}
