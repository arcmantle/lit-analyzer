import { readFileSync } from 'fs';
import fsExtra from 'fs-extra';

const { copy, mkdirp, writeFile } = fsExtra;

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Copy files into the ./built directory.
 *
 * This is the directory that actually has the final filesystem layout for
 * the extension, and to keep the vsix file small we want to only include
 * those files that are needed.
 *
 * Note that ./built/bundle.js is generated directly by esbuild.script.js and
 * not copied by this script.
 */
async function main() {
	// We don't bundle the typescript compiler into ./built/bundle.js, so we need
	// a copy of it. The language server also needs the actual lib.*.d.ts files:
	// `ts.getDefaultLibFilePath` resolves them relative to this copy, and
	// without them the language service can't find a default lib and fails to
	// build a Program. Locale message folders and the tsc/tsserver CLI entry
	// points aren't needed, so the lib copy is filtered down to just those.
	const typescriptLibDir = './node_modules/typescript/lib';
	await mkdirp('./built/node_modules/typescript/lib');
	await copy('./node_modules/typescript/package.json', './built/node_modules/typescript/package.json');
	await copy('./node_modules/typescript/lib/typescript.js', './built/node_modules/typescript/lib/typescript.js');
	await copy('./node_modules/typescript/lib/tsserverlibrary.js', './built/node_modules/typescript/lib/tsserverlibrary.js');
	await copy(typescriptLibDir, './built/node_modules/typescript/lib', {
		filter: src => src === typescriptLibDir || src.endsWith('.d.ts'),
	});

	const pluginPackageJson = readJson('./package.json');
	pluginPackageJson.name = 'lit-analyzer';
	pluginPackageJson.files = [
		'bundle.js',
		'server/**',
		'syntaxes/**',
		'docs/assets/**',
		'node_modules/typescript/**',
		'LICENSE.md',
		'README.md',
	];
	// ./built is a published artifact, so it cannot carry workspace-only
	// specifiers such as `catalog:` -- vsce runs `npm list` over it, and npm
	// does not understand them. Pin to whatever we actually copied above.
	// The alias form covers the compiler being installed under a different
	// package name, e.g. npm:@typescript/typescript6.
	const typescriptPackageJson = readJson('./node_modules/typescript/package.json');
	pluginPackageJson.dependencies['typescript'] =
		typescriptPackageJson.name === 'typescript'
			? typescriptPackageJson.version
			: `npm:${ typescriptPackageJson.name }@${ typescriptPackageJson.version }`;
	// Nothing in ./built is ever installed from, so devDependencies are dead
	// weight -- and they carry `workspace:` specifiers that npm cannot parse.
	delete pluginPackageJson.devDependencies;
	await writeFile('./built/package.json', JSON.stringify(pluginPackageJson, null, 2));

	// Copy static files used by the extension.
	await copy('./LICENSE.md', './built/LICENSE.md');
	await copy('./README.md', './built/README.md');
	await copy('./docs', './built/docs');
	await copy('./syntaxes', './built/syntaxes');
}

main().catch(e => {
	// eslint-disable-next-line no-console
	console.error(e);
	process.exitCode = 1;
});
