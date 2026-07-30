import { AnalyzerCliConfig } from './analyzer-cli-config.js';

export type CliCommand = (config: AnalyzerCliConfig) => Promise<void> | void;
