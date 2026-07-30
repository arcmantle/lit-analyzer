import { SourceFile } from 'typescript';

import { makeContextFromConfig } from './make-context-from-config.js';
import { analyzeComponentDeclaration } from './stages/analyze-declaration.js';
import { discoverDeclarations } from './stages/discover-declarations.js';
import { discoverDefinitions } from './stages/discover-definitions.js';
import { discoverGlobalFeatures } from './stages/discover-global-features.js';
import { AnalyzerOptions } from './types/analyzer-options.js';
import { AnalyzerResult } from './types/analyzer-result.js';
import { ComponentDeclaration, ComponentFeatures } from './types/component-declaration.js';

/**
 * Analyzes all components in a source file.
 * @param sourceFile
 * @param options
 */
export function analyzeSourceFile(sourceFile: SourceFile, options: AnalyzerOptions): AnalyzerResult {
	// Create a new context
	const context = makeContextFromConfig(options);

	// Analyze all components
	const componentDefinitions = discoverDefinitions(sourceFile, context, (definition, declarationNodes) =>
		// The component declaration is analyzed lazily
		analyzeComponentDeclaration(declarationNodes, context));

	// Analyze global features
	let globalFeatures: ComponentFeatures | undefined = undefined;
	if (context.config.analyzeGlobalFeatures)
		globalFeatures = discoverGlobalFeatures(sourceFile, context);


	// Analyze exported declarations
	let declarations: ComponentDeclaration[] | undefined = undefined;
	if (context.config.analyzeAllDeclarations)
		declarations = discoverDeclarations(sourceFile, context);


	return {
		sourceFile,
		componentDefinitions,
		globalFeatures,
		declarations,
	};
}
