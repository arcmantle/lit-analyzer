import { Program } from 'typescript';

import { AnalyzerResult } from '../../analyze/types/analyzer-result.js';
import { arrayFlat } from '../../util/array-util.js';
import { stripTypescriptValues } from '../../util/strip-typescript-values.js';
import { TransformerConfig } from '../transformer-config.js';
import { TransformerFunction } from '../transformer-function.js';

/**
 * Transforms results to json.
 * @param results
 * @param program
 * @param config
 */
export const debugJsonTransformer: TransformerFunction = (results: AnalyzerResult[], program: Program, config: TransformerConfig): string => {
	const definitions = arrayFlat(results.map(res => res.componentDefinitions));

	return JSON.stringify(stripTypescriptValues(definitions, program.getTypeChecker()), null, 2);
};
