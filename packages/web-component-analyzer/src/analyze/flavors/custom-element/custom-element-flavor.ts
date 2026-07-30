import { AnalyzerFlavor } from '../analyzer-flavor.js';
import { discoverDefinitions } from './discover-definitions.js';
import { discoverEvents } from './discover-events.js';
import { discoverGlobalFeatures } from './discover-global-features.js';
import { discoverInheritance } from './discover-inheritance.js';
import { discoverMembers } from './discover-members.js';
import { discoverMethods } from './discover-methods.js';
import { excludeNode } from './exclude-node.js';

/**
 * A flavor that discovers using standard custom element rules
 */
export class CustomElementFlavor implements AnalyzerFlavor {

	excludeNode = excludeNode;

	discoverDefinitions = discoverDefinitions;

	discoverFeatures = {
		member: discoverMembers,
		event:  discoverEvents,
		method: discoverMethods,
	};

	discoverGlobalFeatures = discoverGlobalFeatures;

	discoverInheritance = discoverInheritance;

}
