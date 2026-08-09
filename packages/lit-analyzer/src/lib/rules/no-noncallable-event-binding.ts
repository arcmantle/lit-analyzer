import { SignatureKind, Type, TypeChecker, TypeFlags } from 'typescript';

import { HtmlNodeAttrKind } from '../analyze/types/html-node/html-node-attr-types.js';
import { RuleModule } from '../analyze/types/rule/rule-module.js';
import { rangeFromHtmlNodeAttr } from '../analyze/util/range-util.js';
import { extractBindingTypes } from './util/type/extract-binding-types.js';
import { typeToDisplayString } from './util/type/type-utils.js';

/**
 * This rule validates that only callable types are used within event binding expressions.
 * This rule catches typos like: @click="onClick()"
 */
const rule: RuleModule = {
	id:   'no-noncallable-event-binding',
	meta: {
		priority: 'high',
	},
	visitHtmlAssignment(assignment, context) {
		// Only validate event listener bindings.
		const { htmlAttr } = assignment;
		if (htmlAttr.kind !== HtmlNodeAttrKind.EVENT_LISTENER)
			return;

		const { typeB } = extractBindingTypes(assignment, context);
		const checker = context.program.getTypeChecker();

		// Make sure that the expression given to the event listener binding a function or an object with "handleEvent" property.
		if (!isTypeBindableToEventListener(typeB, checker)) {
			context.report({
				location: rangeFromHtmlNodeAttr(htmlAttr),
				message:  `You are setting up an event listener with a non-callable type '${ typeToDisplayString(typeB, checker) }'`,
			});
		}
	},
};

export default rule;

/**
 * Returns if this type can be used in a event listener binding
 * @param type
 */
function isTypeBindableToEventListener(type: Type, checker: TypeChecker): boolean {
	if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.TypeParameter)) !== 0)
		return true;

	if (type.isUnion()) {
		return type.types.every(member => {
			return (member.flags & (TypeFlags.Null | TypeFlags.Undefined)) !== 0
				|| isTypeBindableToEventListener(member, checker);
		});
	}

	if (type.isIntersection())
		return type.types.every(member => isTypeBindableToEventListener(member, checker));

	if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0)
		return true;

	const handleEvent = checker.getPropertyOfType(type, 'handleEvent');

	return handleEvent != null && isTypeBindableToEventListener(checker.getTypeOfSymbol(handleEvent), checker);
}
