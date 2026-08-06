import { Node } from 'typescript';

import { AnalyzerVisitContext } from '../analyzer-visit-context.js';
import { AnalyzerDeclarationVisitContext, ComponentFeatureCollection } from '../flavors/analyzer-flavor.js';
import { ComponentDeclaration } from '../types/component-declaration.js';
import { getNodeName, getSymbol, resolveDeclarations } from '../util/ast-util.js';
import { getJsDoc } from '../util/js-doc-util.js';
import { discoverFeatures } from './discover-features.js';
import { discoverInheritance } from './discover-inheritance.js';
import { excludeNode } from './flavor/exclude-node.js';
import { refineDeclaration } from './flavor/refine-declaration.js';
import { mergeFeatures } from './merge/merge-features.js';

/**
 * Discovers features on component declaration nodes
 * @param initialDeclarationNodes
 * @param baseContext
 * @param options
 */
export function analyzeComponentDeclaration(
	initialDeclarationNodes: Node[],
	baseContext: AnalyzerVisitContext,
	options: { visitedNodes?: Set<Node>; } = {},
): ComponentDeclaration | undefined {
	const mainDeclarationNode = initialDeclarationNodes[0];
	if (mainDeclarationNode == null)
		return undefined;
		//throw new Error("Couldn't find main declaration node");


	options.visitedNodes = options.visitedNodes || new Set();

	// Discover inheritance
	const { declarationKind, declarationNodes, heritageClauses } = discoverInheritance(initialDeclarationNodes, options.visitedNodes, baseContext);

	// Expand all heritage clauses with the component declaration
	for (const heritageClause of heritageClauses) {
		// Only resolve declarations we haven't yet seen and shouldn't be excluded
		const declarations = resolveDeclarations(heritageClause.identifier, baseContext).filter(
			n => !options.visitedNodes?.has(n) && !shouldExcludeNode(n, baseContext),
		);

		if (declarations.length > 0)
			heritageClause.declaration = analyzeComponentDeclaration(declarations, baseContext, options);
	}

	// Get symbol of main declaration node
	const symbol = getSymbol(mainDeclarationNode, baseContext);

	const sourceFile = mainDeclarationNode.getSourceFile();

	const baseDeclaration: ComponentDeclaration = {
		sourceFile,
		node:             mainDeclarationNode,
		declarationNodes: new Set(declarationNodes),
		symbol,
		heritageClauses,
		kind:             declarationKind || 'class',
		events:           [],
		cssParts:         [],
		cssProperties:    [],
		members:          [],
		methods:          [],
		slots:            [],
		jsDoc:            getJsDoc(mainDeclarationNode, baseContext.ts),
	};

	// Add the "get declaration" hook to the context
	const context: AnalyzerDeclarationVisitContext = {
		...baseContext,
		declarationNode: mainDeclarationNode,
		sourceFile:      mainDeclarationNode.getSourceFile(),
		getDeclaration:  () => baseDeclaration,
	};

	// Find features on all declaration nodes
	const featureCollections: ComponentFeatureCollection[] = [];

	for (const node of declarationNodes) {
		if (shouldExcludeNode(node, context))
			continue;


		// Discover component features using flavors
		featureCollections.push(
			discoverFeatures(node, {
				...context,
				declarationNode: node,
				sourceFile:      node.getSourceFile(),
			}),
		);
	}

	// Add all inherited features to the feature collections array
	for (const heritageClause of heritageClauses) {
		if (heritageClause.declaration != null) {
			featureCollections.push({
				...heritageClause.declaration,
				members: heritageClause.declaration.members,
			});
		}
	}

	// If all nodes were excluded, return empty declaration
	if (featureCollections.length === 0)
		return baseDeclaration;


	// Merge all features into one single collection prioritizing features found in first
	const mergedFeatureCollection = mergeFeatures(featureCollections, context);

	// Refine the declaration and return the result
	const refinedDeclaration = refineDeclaration(
		{
			...baseDeclaration,
			cssParts:      mergedFeatureCollection.cssParts,
			cssProperties: mergedFeatureCollection.cssProperties,
			events:        mergedFeatureCollection.events,
			methods:       mergedFeatureCollection.methods,
			members:       mergedFeatureCollection.members,
			slots:         mergedFeatureCollection.slots,
		},
		context,
	);

	Object.assign(baseDeclaration, refinedDeclaration);

	return baseDeclaration;
}

/**
 * Returns if a node should be excluded from the analyzing
 * @param node
 * @param context
 */
function shouldExcludeNode(node: Node, context: AnalyzerVisitContext): boolean {
	// Uses flavors to determine if the node should be excluded
	if (excludeNode(node, context))
		return true;


	// It's possible to exclude declaration names
	const name = getNodeName(node, context);

	if (name != null && context.config.excludedDeclarationNames?.includes(name))
		return true;


	return false;
}
