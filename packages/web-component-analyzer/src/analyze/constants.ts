import type { Node, Program } from 'typescript';

import { AnalyzerFlavor, ComponentFeatureCollection } from './flavors/analyzer-flavor.js';
import { CustomElementFlavor } from './flavors/custom-element/custom-element-flavor.js';
import { JsDocFlavor } from './flavors/js-doc/js-doc-flavor.js';
import { JSXFlavor } from './flavors/jsx/jsx-flavor.js';
import { LitElementFlavor } from './flavors/lit-element/lit-element-flavor.js';
import { LwcFlavor } from './flavors/lwc/lwc-flavor.js';
import { ComponentDeclaration } from './types/component-declaration.js';

// Upstream substituted this at bundle time with rollup's `replace` plugin, using
// `<@VERSION@>` as the placeholder. The `tsc` build has no such step, so the
// value is written out literally and moves with the package version.
export const VERSION = '2.0.0';

export const DEFAULT_FLAVORS: AnalyzerFlavor[] = [
	new LitElementFlavor(),
	new LwcFlavor(),
	new CustomElementFlavor(),
	new JsDocFlavor(),
	new JSXFlavor(),
];

export interface AnalyzerCaches {
	featureCollection:         WeakMap<Node, ComponentFeatureCollection>;
	componentDeclarationCache: WeakMap<Node, ComponentDeclaration>;
}

const CACHES_FOR_PROGRAM: WeakMap<Program, AnalyzerCaches> = new WeakMap();

/**
 * A cached declaration holds the types its own program's checker gave it, and a
 * node keeps its object identity when a program reuses an unchanged file. One
 * cache per program stops a later program from reading those earlier types.
 */
export function analyzerCachesForProgram(program: Program): AnalyzerCaches {
	const caches = CACHES_FOR_PROGRAM.get(program) ?? {
		featureCollection:         new WeakMap<Node, ComponentFeatureCollection>(),
		componentDeclarationCache: new WeakMap<Node, ComponentDeclaration>(),
	};
	CACHES_FOR_PROGRAM.set(program, caches);

	return caches;
}
