import { TypeFlags } from "typescript";

import { analyzeTextWithCurrentTsModule } from "../../helpers/analyze-text-with-current-ts-module.js";
import { tsTest } from "../../helpers/ts-test.js";
import { assertHasMembers } from "../../helpers/util.js";

tsTest("jsdoc: Discovers properties with @prop", t => {
	const {
		results: [result],
		checker
	} = analyzeTextWithCurrentTsModule(`
	/**
	 * @element
	 * @prop {String} [prop1=def] - This is a comment
	 * @attr {MySuperType} attr1
	 * @prop {number} size
	 * @attr [size=123]
	 * @prop {MyType} this is a prop with no name
	 */
	 class MyElement extends HTMLElement {
	 }
	 `);

	const { members = [] } = result.componentDefinitions[0]?.declaration || {};

	assertHasMembers(
		members,
		[
			{
				kind: "property",
				propName: "prop1",
				attrName: undefined,
				jsDoc: {
					description: "This is a comment"
				},
				default: "def",
				typeHint: "String",
				type: checker => checker.getStringType(),
				visibility: undefined,
				reflect: undefined,
				deprecated: undefined,
				required: undefined
			},
			{
				kind: "attribute",
				propName: undefined,
				attrName: "attr1",
				jsDoc: undefined,
				default: undefined,
				typeHint: "MySuperType",
				type: undefined,
				visibility: undefined,
				reflect: undefined,
				deprecated: undefined,
				required: undefined
			},
			{
				kind: "property",
				propName: "size",
				attrName: "size",
				jsDoc: undefined,
				default: 123,
				typeHint: "number",
				type: checker => checker.getNumberType(),
				visibility: undefined,
				reflect: undefined,
				deprecated: undefined,
				required: undefined
			}
		],
		t,
		checker
	);
});

tsTest("jsdoc: Discovers attributes defined on getters with @attr", t => {
	const {
		results: [result],
		checker
	} = analyzeTextWithCurrentTsModule(`
	/**
	 * @element
	 */
	 class MyElement extends HTMLElement {
		/**
		 * This is a comment
		 * @attr {boolean} [auto-reload=false]
		 */
		get autoReload() {
			return this.hasAttribute('auto-reload');
		}
	 }
	 `);

	const { members = [] } = result.componentDefinitions[0]?.declaration || {};

	assertHasMembers(
		members,
		[
			{
				kind: "property",
				propName: "autoReload",
				attrName: "auto-reload",
				jsDoc: {
					description: "This is a comment"
				},
				default: false,
				typeHint: "boolean",
				type: checker => checker.getBooleanType(),
				visibility: "public",
				reflect: undefined,
				deprecated: undefined,
				required: undefined
			}
		],
		t,
		checker
	);
});

tsTest("jsdoc: Resolves imported types on getter @attr tags", t => {
	const {
		results: [result],
		checker,
	} = analyzeTextWithCurrentTsModule([
		{
			fileName: "component.ts",
			text: `
			import type { Value } from "./types.js";
			/** @element */
			class MyElement extends HTMLElement {
				/** @attr {Value} value */
				get value() {
					return this.getAttribute("value");
				}
			}
			`,
		},
		{
			fileName: "types.ts",
			text: 'export type Value = "ready";',
		},
	]);
	const member = result.componentDefinitions[0].declaration!.members.find(m => m.attrName === "value");

	if (member == null)
		throw new Error("The getter attribute was not discovered");

	t.is(member.type == null ? undefined : checker.typeToString(member.type(checker)), '"ready"');
});

tsTest("jsdoc: Resolves compiler-owned Array types", t => {
	const {
		results: [result],
		checker,
	} = analyzeTextWithCurrentTsModule(`
		interface Array<T> {}

		/**
		 * @element
		 * @prop {Array} values
		 */
		class MyElement extends HTMLElement {}
	`);
	const member = result.componentDefinitions[0].declaration!.members.find(m => m.propName === "values");

	if (member == null)
		throw new Error("The Array property was not discovered");

	t.true(member.type != null && checker.isArrayType(member.type(checker)));
});

tsTest("jsdoc: Resolves object literal types through the active Program", t => {
	const {
		results: [result],
		checker,
	} = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 * @prop {{x: number; y: number}} position
		 */
		class MyElement extends HTMLElement {}
	`);
	const member = result.componentDefinitions[0].declaration!.members.find(m => m.propName === "position");

	if (member == null)
		throw new Error("The object property was not discovered");

	const type = member.type?.(checker);
	const xProperty = type == null ? undefined : checker.getPropertyOfType(type, "x");
	t.truthy(xProperty);
});

tsTest("jsdoc: Leaves unresolved types without a checker-backed type", t => {
	const { results: [result] } = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 * @prop {MissingType} value
		 */
		class MyElement extends HTMLElement {}
	`);
	const member = result.componentDefinitions[0].declaration!.members.find(m => m.propName === "value");

	if (member == null)
		throw new Error("The unresolved property was not discovered");

	t.is(member.typeHint, "MissingType");
	t.is(member.type, undefined);
});

tsTest("jsdoc: Preserves an explicit any type", t => {
	const {
		results: [result],
		checker,
	} = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 * @prop {any} value
		 */
		class MyElement extends HTMLElement {}
	`);
	const member = result.componentDefinitions[0].declaration!.members.find(m => m.propName === "value");

	if (member == null)
		throw new Error("The any property was not discovered");

	const type = member.type?.(checker);
	t.true(type != null && (type.flags & TypeFlags.Any) !== 0);
});
