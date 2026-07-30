import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
const { version } = pkg;

const constantsPath = path.resolve('src/lib/analyze/constants.ts');
const constantsSource = fs.readFileSync(constantsPath, 'utf-8');

// Accept either quote style, so a change of quote convention in
// `constants.ts` does not fail this check.
if (!constantsSource.includes(`'${ version }'`) && !constantsSource.includes(`"${ version }"`)) {
	// eslint-disable-next-line no-console
	console.log(`\nExpected src/lib/analyze/constants.ts to contain the current version ${ version }`);
	process.exit(1);
}
