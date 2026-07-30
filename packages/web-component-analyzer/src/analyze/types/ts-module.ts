import type tsModule from 'typescript';

/**
 * The TypeScript module the analyzer runs on.
 *
 * This has to be the default import, not `typeof import('typescript')`.
 *
 * This package is ESM, so a namespace import of TypeScript (a CommonJS module)
 * carries an extra `default` member. `lit-analyzer` is CommonJS, so its own
 * namespace import has no `default`, and passing it in fails to type-check
 * against the ESM-shaped namespace. The default import names the value both
 * sides actually hold: the `export =` object itself.
 */
export type TsModule = typeof tsModule;
