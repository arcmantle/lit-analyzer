import { Program } from 'typescript';

import { AnalyzerResult } from '../analyze/types/analyzer-result.js';
import { TransformerConfig } from './transformer-config.js';

export type TransformerFunction = (results: AnalyzerResult[], program: Program, config: TransformerConfig) => string;
