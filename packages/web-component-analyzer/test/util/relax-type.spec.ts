import { SimpleType } from 'ts-simple-type';

import { analyzeTextWithCurrentTsModule } from '../helpers/analyze-text-with-current-ts-module.js';
import { tsTest } from '../helpers/ts-test.js';

/**
 * `relaxType` runs on the type of the expression assigned to `this.x` in a
 * javascript constructor. A function that returns a generic alias puts a
 * `GENERIC_ARGUMENTS` wrapper on that type.
 */
function memberType(propName: string): SimpleType {
	const { results } = analyzeTextWithCurrentTsModule({
		fileName: 'test.js',
		text:     `
			/**
			 * @typedef {T | undefined} Maybe
			 * @template T
			 */

			/**
			 * @returns {Maybe<"a">}
			 */
			function makeMaybe() {
				return undefined;
			}

			class MyElement extends HTMLElement {
				constructor() {
					super();
					this.maybe = makeMaybe();
				}
			}

			customElements.define("my-element", MyElement);
		`,
	});

	const member = results[0].componentDefinitions[0].declaration!.members.find(m => m.propName === propName);

	return member!.type!();
}

tsTest('relaxType looks through a generic alias wrapper', t => {
	let type = memberType('maybe');

	t.is(type.kind, 'GENERIC_ARGUMENTS');

	while (type.kind === 'GENERIC_ARGUMENTS' || type.kind === 'ALIAS')
		type = type.target;

	t.is(type.kind, 'UNION');

	const kinds = type.kind === 'UNION' ? type.types.map(member => member.kind).sort() : [];

	t.deepEqual(kinds, [ 'ANY', 'STRING' ]);
});
