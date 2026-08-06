import { Type } from 'typescript';

import { HtmlNodeAttr } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { rangeFromHtmlNodeAttr } from '../../../analyze/util/range-util.js';
import { isAssignableToType } from './is-assignable-to-type.js';
import { typeToDisplayString } from './type-utils.js';


export function isAssignableInBooleanBinding(
	htmlAttr: HtmlNodeAttr,
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean | undefined {
	const checker = context.program.getTypeChecker();
	const typeBIsAssignableToBooleanBinding = [
		checker.getBooleanType(),
		checker.getUndefinedType(),
		checker.getNullType(),
	].some(target => checker.isTypeAssignableTo(typeB, target));

	// Test if the user is trying to use ? modifier on a non-boolean type.
	if (!typeBIsAssignableToBooleanBinding) {
		context.report({
			location: rangeFromHtmlNodeAttr(htmlAttr),
			message:  `Type '${ typeToDisplayString(typeB, checker) }' is not assignable to 'boolean'`,
		});

		return false;
	}

	// Test if the user is trying to use the ? modifier on a non-boolean type.
	const booleanIsAssignableToTypeA = isAssignableToType(
		{ typeA, typeB: checker.getBooleanType() },
		context,
	);

	if (!booleanIsAssignableToTypeA) {
		context.report({
			location: rangeFromHtmlNodeAttr(htmlAttr),
			message:  `You are using a boolean binding on a non boolean type '${ typeToDisplayString(typeA, checker) }'`,
			fix:      () => {
				const htmlAttrTarget = context.htmlStore.getHtmlAttrTarget(htmlAttr);
				const newModifier = htmlAttrTarget == null ? '.' : '';

				return {
					message: newModifier.length === 0
						? `Remove '${ htmlAttr.modifier || '' }' modifier`
						: `Use '${ newModifier }' modifier instead`,
					actions: [
						{
							kind: 'changeAttributeModifier',
							htmlAttr,
							newModifier,
						},
					],
				};
			},
		});

		return false;
	}

	return true;
}
