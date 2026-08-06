import { AnalyzerFlavor } from './flavors/analyzer-flavor.js';
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
