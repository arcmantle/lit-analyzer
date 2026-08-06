import { Type } from 'typescript';

import { analyzeTextWithCurrentTsModule } from '../helpers/analyze-text-with-current-ts-module.js';
import { tsTest } from '../helpers/ts-test.js';

/**
 * `relaxType` runs on the type of the expression assigned to `this.x` in a
 * JavaScript constructor. A function that returns a generic instantiation
 * gives TypeScript a type that `relaxType` must normalize.
 */
function memberType(propName: string): { program: ReturnType<typeof analyzeTextWithCurrentTsModule>['program']; type: Type; } {
	const { results, program } = analyzeTextWithCurrentTsModule({
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

	return { program, type: member!.type!(program.getTypeChecker()) };
}

tsTest('relaxType normalizes a generic instantiation type', t => {
	const { program, type } = memberType('maybe');

	t.is(program.getTypeChecker().typeToString(type), 'any');
});

tsTest('relaxType converts JavaScript interface members to any', t => {
	const { program, results } = analyzeTextWithCurrentTsModule([
		{
			fileName: 'types.d.ts',
			text:     'interface Box { value: string; }',
			analyze:  false,
		},
		{
			fileName: 'test.js',
			text:     `
				/** @returns {Box} */
				function makeBox() {
					return undefined;
				}

				class MyElement extends HTMLElement {
					constructor() {
						super();
						this.box = makeBox();
					}
				}

				customElements.define('my-element', MyElement);
			`,
		},
	]);
	const type = results[0].componentDefinitions[0].declaration!.members.find(member => member.propName === 'box')!.type!(program.getTypeChecker());

	t.is(program.getTypeChecker().typeToString(type), 'any');
});

tsTest('relaxType recursively relaxes intersection members', t => {
	const { program, results } = analyzeTextWithCurrentTsModule([
		{
			fileName: 'types.d.ts',
			text:     'interface Box { value: string; }',
			analyze:  false,
		},
		{
			fileName: 'test.js',
			text:     `
				/** @returns {Box & { label: string }} */
				function makeBox() {
					return undefined;
				}

				class MyElement extends HTMLElement {
					constructor() {
						super();
						this.box = makeBox();
					}
				}

				customElements.define('my-element', MyElement);
			`,
		},
	]);
	const type = results[0].componentDefinitions[0].declaration!.members.find(member => member.propName === 'box')!.type!(program.getTypeChecker());

	t.is(program.getTypeChecker().typeToString(type), 'any & { label: string; }');
});

tsTest('relaxType recursively relaxes array type arguments', t => {
	const { program, results } = analyzeTextWithCurrentTsModule([
		{
			fileName: 'types.d.ts',
			text:     'interface Box { value: string; }',
			analyze:  false,
		},
		{
			fileName: 'test.js',
			text:     `
				/** @returns {Array<Box>} */
				function makeBoxes() {
					return undefined;
				}

				class MyElement extends HTMLElement {
					constructor() {
						super();
						this.boxes = makeBoxes();
					}
				}

				customElements.define('my-element', MyElement);
			`,
		},
	]);
	const type = results[0].componentDefinitions[0].declaration!.members.find(member => member.propName === 'boxes')!.type!(program.getTypeChecker());

	t.is(program.getTypeChecker().typeToString(type), 'Array<any>');
});

tsTest('relaxType recursively relaxes promise type arguments', t => {
	const { program, results } = analyzeTextWithCurrentTsModule([
		{
			fileName: 'types.d.ts',
			text:     'interface Box { value: string; }',
			analyze:  false,
		},
		{
			fileName: 'test.js',
			text:     `
				/** @returns {Promise<Box>} */
				function makeBox() {
					return undefined;
				}

				class MyElement extends HTMLElement {
					constructor() {
						super();
						this.box = makeBox();
					}
				}

				customElements.define('my-element', MyElement);
			`,
		},
	]);
	const type = results[0].componentDefinitions[0].declaration!.members.find(member => member.propName === 'box')!.type!(program.getTypeChecker());

	t.is(program.getTypeChecker().typeToString(type), 'Promise<any>');
});

tsTest('relaxType recursively relaxes generic alias arguments', t => {
	const { program, results } = analyzeTextWithCurrentTsModule([
		{
			fileName: 'types.d.ts',
			text:     'interface Box { value: string; } type Holder<T> = { value: T; };',
			analyze:  false,
		},
		{
			fileName: 'test.js',
			text:     `
				/** @returns {Holder<Box>} */
				function makeHolder() {
					return undefined;
				}

				class MyElement extends HTMLElement {
					constructor() {
						super();
						this.holder = makeHolder();
					}
				}

				customElements.define('my-element', MyElement);
			`,
		},
	]);
	const type = results[0].componentDefinitions[0].declaration!.members.find(member => member.propName === 'holder')!.type!(program.getTypeChecker());

	t.is(program.getTypeChecker().typeToString(type), 'Holder<any>');
});

tsTest('relaxType converts JavaScript class and function members to any', t => {
	const { program, results } = analyzeTextWithCurrentTsModule([
		{
			fileName: 'types.d.ts',
			text:     'declare class Widget { value: string; }',
			analyze:  false,
		},
		{
			fileName: 'test.js',
			text:     `
				/** @returns {Widget} */
				function makeWidget() {
					return undefined;
				}

				/** @returns {() => string} */
				function makeCallback() {
					return undefined;
				}

				class MyElement extends HTMLElement {
					constructor() {
						super();
						this.widget = makeWidget();
						this.callback = makeCallback();
					}
				}

				customElements.define('my-element', MyElement);
			`,
		},
	]);
	const members = results[0].componentDefinitions[0].declaration!.members;
	const checker = program.getTypeChecker();

	t.is(checker.typeToString(members.find(member => member.propName === 'widget')!.type!(checker)), 'any');
	t.is(checker.typeToString(members.find(member => member.propName === 'callback')!.type!(checker)), 'any');
});
