import { dirname, resolve, sep } from 'node:path';

import { compileTypescript } from '../../lib/cli/compile.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('compileTypescript includes the JSDoc resolver in the active Program', t => {
	const fileName = resolve(import.meta.dirname, '../../../../web-component-analyzer/dev/src/lit-element/lit-element.ts');
	const { program, files } = compileTypescript(fileName);

	t.true(program.getSourceFile(`${ fileName }.__lit_jsdoc__.d.ts`) != null);
	t.deepEqual(files.map(file => file.fileName), [ fileName ]);
});

tsTest('compileTypescript retains requested files after TypeScript normalizes their paths', t => {
	const fileName = resolve(import.meta.dirname, '../../../../web-component-analyzer/dev/src/lit-element/lit-element.ts');
	const unnormalizedFileName = `${ dirname(fileName) }${ sep }..${ sep }lit-element${ sep }lit-element.ts`;
	const { files } = compileTypescript(unnormalizedFileName);

	t.deepEqual(files.map(file => file.fileName), [ fileName ]);
});
