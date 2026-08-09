import * as esbuild from 'esbuild';

// The extension bundle is ESM. Two things are required to make that work and
// both are easy to lose:
//
// 1. `built/package.json` must say `"type": "module"`. copy-to-built.js sets it.
// 2. The banner below. Bundled CommonJS dependencies still call `require` for
//    Node builtins, and esbuild rewrites those to its own `__require` helper.
//    That helper delegates to `require` when one is in scope and throws
//    'Dynamic require of "x" is not supported' when one is not, so an ESM bundle
//    needs a real `require` created from `import.meta.url`.
await esbuild.build({
	entryPoints: [ 'src/extension.ts' ],
	bundle:      true,
	outfile:     'built/bundle.js',
	platform:    'node',
	minify:      true,
	target:      'es2020',
	format:      'esm',
	color:       true,
	external:    [ 'vscode', 'typescript' ],
	mainFields:  [ 'module', 'main' ],
	banner:      {
		js: [ "import { createRequire as __createRequire } from 'node:module';", 'const require = __createRequire(import.meta.url);' ].join('\n'),
	},
});

// The language server: its own process, spawned by the extension over stdio
// on activation. `typescript` stays external and resolves to the same
// `built/node_modules/typescript` copy-to-built.js already provides for
// bundle.js -- bundling it broke the compiler's own `__dirname`-relative
// lookup of its lib.*.d.ts files, which only surfaced once a real tsconfig
// needed a lib file the fixture project didn't.
await esbuild.build({
	entryPoints: [ '../lit-language-server/src/main.ts' ],
	bundle:      true,
	outfile:     'built/server/main.js',
	platform:    'node',
	minify:      true,
	target:      'es2022',
	format:      'esm',
	color:       true,
	external:    [ 'typescript' ],
	mainFields:  [ 'module', 'main' ],
	banner:      {
		js: [ "import { createRequire as __createRequire } from 'node:module';", 'const require = __createRequire(import.meta.url);' ].join('\n'),
	},
});

await esbuild.build({
	entryPoints: [ '../lit-language-server/src/bootstrap.ts' ],
	bundle:      true,
	outfile:     'built/server/bootstrap.js',
	platform:    'node',
	minify:      true,
	target:      'node24',
	format:      'esm',
	color:       true,
	external:    [ './main.js' ],
});
