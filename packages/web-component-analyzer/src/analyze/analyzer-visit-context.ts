import type tsModule from 'typescript';
import { Program, TypeChecker } from 'typescript';

import { AnalyzerFlavor } from './flavors/analyzer-flavor.js';
import { AnalyzerConfig } from './types/analyzer-config.js';

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
}
