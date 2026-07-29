// This package is CommonJS, and `pnpm check-version` runs this file straight
// from source. Node strips the types but does not rewrite module syntax, so the
// source has to be CommonJS too. `import(...)` in type position and `as` are
// both erased, leaving a plain `require`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
const { version } = pkg;

const constantsPath = path.resolve('src/lib/analyze/constants.ts');
const constantsSource = fs.readFileSync(constantsPath, 'utf-8');

if (!constantsSource.includes(`"${ version }"`)) {
	// eslint-disable-next-line no-console
	console.log(`\nExpected src/lib/analyze/constants.ts to contain the current version "${ version }"`);
	process.exit(1);
}
