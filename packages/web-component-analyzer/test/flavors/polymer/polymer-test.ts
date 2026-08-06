import { analyzeTextWithCurrentTsModule } from "../../helpers/analyze-text-with-current-ts-module.js";
import { tsTest } from "../../helpers/ts-test.js";
import { getComponentProp } from "../../helpers/util.js";

tsTest("Polymer components are correctly picked up", t => {
	const {
		results: [result],
		checker
	} = analyzeTextWithCurrentTsModule(`
		class XCustom extends PolymerElement {
			static get properties() {
				return {
					user: String,
					isHappy: Boolean,
					count: {
						type: Number,
						readOnly: true,
						notify: true,
						value: 10
					}
				}
			}
		}

		customElements.define('x-custom', XCustom);
	 `);

	const { members } = result.componentDefinitions[0].declaration!;

	t.is(members.length, 3);

	const userProp = getComponentProp(members, "user");
	t.truthy(userProp);
	t.truthy(checker.isTypeAssignableTo(userProp!.type!(checker), checker.getStringType()));
	t.is(userProp!.attrName, "user");

	const isHappyProp = getComponentProp(members, "isHappy");
	t.truthy(isHappyProp);
	t.truthy(checker.isTypeAssignableTo(isHappyProp!.type!(checker), checker.getBooleanType()));
	t.is(isHappyProp!.attrName, "is-happy");

	const countProp = getComponentProp(members, "count");
	t.truthy(countProp);
	t.truthy(checker.isTypeAssignableTo(countProp!.type!(checker), checker.getNumberType()));
	t.is(countProp!.attrName, "count");
	t.is(countProp!.default, 10);
});
