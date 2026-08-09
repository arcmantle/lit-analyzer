import { DefaultLitAnalyzerContext, LitAnalyzer, type LitAnalyzerConfig, makeConfig } from '@arcmantle/lit-analyzer';
import type { HostCancellationToken } from 'typescript';

import type { AnalysisCompiler } from './analysis-compiler.js';

export interface LitAnalyzerHandle {
	readonly analyzer: LitAnalyzer;
	/** Replaces the config used for every subsequent analysis call. */
	setConfig(config: LitAnalyzerConfig): void;
}

/**
 * Builds a `LitAnalyzer` wired to the given analysis compiler's `Program`.
 *
 * `LitAnalyzerContext.project` is a tsserver-only `Project` used by the old
 * `ts-lit-plugin` path for cancellation and reading compiler options; it is
 * optional and left undefined here. Dependency resolution no longer looks
 * at it at all -- `visit-dependencies.ts` resolves through the `Program`'s
 * own public `getResolvedModuleFromModuleSpecifier`/`getModuleResolutionCache`
 * APIs instead.
 *
 * `getCancellationToken`, when given, is read fresh every time the analyzer
 * starts a new operation -- so the caller can swap in whatever token
 * represents "the run currently in flight" (e.g. from a `DebouncedRunner`)
 * without rebuilding the analyzer.
 */
export function createLitAnalyzer(
	compiler: AnalysisCompiler,
	getCancellationToken?: () => HostCancellationToken,
): LitAnalyzerHandle {
	const context = new DefaultLitAnalyzerContext({
		getProgram: () => compiler.getProgram(),
		getCancellationToken,
	});
	context.updateConfig(makeConfig({}));

	return {
		analyzer:  new LitAnalyzer(context),
		setConfig: config => context.updateConfig(config),
	};
}
