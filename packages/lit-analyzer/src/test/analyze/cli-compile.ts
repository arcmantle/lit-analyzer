import { resolve } from 'node:path';

import { compileTypescript } from '../../lib/cli/compile.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('compileTypescript includes the JSDoc resolver in the active Program', t => {
	const fileName = resolve(import.meta.dirname, '../../../../web-component-analyzer/dev/src/lit-element/lit-element.ts');
	const { program, files } = compileTypescript(fileName);

	t.true(program.getSourceFile(`${ fileName }.__lit_jsdoc__.d.ts`) != null);
	t.deepEqual(files.map(file => file.fileName), [ fileName ]);
});
