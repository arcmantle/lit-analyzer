import { resolve } from "node:path";

import { compileTypescript } from "../../src/cli/util/compile.js";
import { tsTest } from "../helpers/ts-test.js";

tsTest("compileTypescript includes the JSDoc resolver in the active Program", t => {
	const fileName = resolve(import.meta.dirname, "../../dev/src/lit-element/lit-element.ts");
	const { program, files } = compileTypescript(fileName);

	t.truthy(program.getSourceFile(`${ fileName }.__lit_jsdoc__.d.ts`));
	t.deepEqual(files.map(file => file.fileName), [ fileName ]);
});