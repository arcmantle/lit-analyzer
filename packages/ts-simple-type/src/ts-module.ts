import * as tsModule from 'typescript';

/**
 * The TypeScript API surface callers hand to this package.
 *
 * This package is ESM, so Node16 resolution synthesizes a `default` property
 * when it imports the CommonJS `typescript` package. A CommonJS consumer
 * importing that same module does not get `default`, so requiring it here
 * would reject those callers. Nothing in this package reads `default`, so it
 * is excluded from the public signature.
 */
export type TypeScriptModule = Omit<typeof tsModule, 'default'>;

let selectedTSModule = tsModule;

export function setTypescriptModule(ts: TypeScriptModule): void {
	selectedTSModule = ts as typeof tsModule;
}

export function getTypescriptModule(): typeof tsModule {
	return selectedTSModule;
}
