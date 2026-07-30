import type tsModule from 'typescript';
import { Program } from 'typescript';

import { AnalyzerFlavor } from '../flavors/analyzer-flavor.js';
import { AnalyzerConfig } from './analyzer-config.js';

/**
 * Options to give when analyzing components
 */
export interface AnalyzerOptions {
	program:  Program;
	ts?:      typeof tsModule;
	flavors?: AnalyzerFlavor[];
	config?:  AnalyzerConfig;
	verbose?: boolean;
}
