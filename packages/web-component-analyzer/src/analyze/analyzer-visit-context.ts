import type tsModule from 'typescript';
import { Node, Program, TypeChecker } from 'typescript';

import { AnalyzerFlavor, ComponentFeatureCollection } from './flavors/analyzer-flavor.js';
import { AnalyzerConfig } from './types/analyzer-config.js';
import { ComponentDeclaration } from './types/component-declaration.js';

/**
 * This context is used in the entire analyzer.
 * A new instance of this is created whenever the analyzer runs.
 */
export interface AnalyzerVisitContext {
	checker: TypeChecker;
	program: Program;
	ts:      typeof tsModule;
	config:  AnalyzerConfig;
	flavors: AnalyzerFlavor[];
	emitContinue?(): void;
	cache: {
		featureCollection:         WeakMap<Node, ComponentFeatureCollection>;
		componentDeclarationCache: WeakMap<Node, ComponentDeclaration>;
		general:                   Map<unknown, unknown>;
	};
}
