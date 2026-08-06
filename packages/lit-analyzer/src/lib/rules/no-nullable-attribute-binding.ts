import { HtmlNodeAttrAssignmentKind } from '../analyze/types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttrKind } from '../analyze/types/html-node/html-node-attr-types.js';
import { RuleModule } from '../analyze/types/rule/rule-module.js';
import { rangeFromHtmlNodeAttr } from '../analyze/util/range-util.js';
import { extractBindingTypes } from './util/type/extract-binding-types.js';
import { hasFlag, typeToDisplayString } from './util/type/type-utils.js';

/**
 * This rule validates that "null" and "undefined" types are not bound in an attribute binding.
 */
const rule: RuleModule = {
	id:   'no-nullable-attribute-binding',
	meta: {
		priority: 'high',
	},
	visitHtmlAssignment(assignment, context) {
		// Only validate "expression" kind bindings.
		if (assignment.kind !== HtmlNodeAttrAssignmentKind.EXPRESSION)
			return;

		// Only validate "attribute" bindings because these will coerce null|undefined to a string.
		const { htmlAttr } = assignment;
		if (htmlAttr.kind !== HtmlNodeAttrKind.ATTRIBUTE)
			return;

		const { typeB } = extractBindingTypes(assignment, context);
		const checker = context.program.getTypeChecker();
		const isAssignableToNull = hasFlag(typeB, checker.getNullType().flags);

		// Test if removing "undefined" or "null" from typeB would work and suggest using "ifDefined".
		if (isAssignableToNull || hasFlag(typeB, checker.getUndefinedType().flags)) {
			context.report({
				location: rangeFromHtmlNodeAttr(htmlAttr),
				message:  `This attribute binds the type '${ typeToDisplayString(typeB, checker) }' which can end up binding the string '${
					isAssignableToNull ? 'null' : 'undefined'
				}'.`,
				fixMessage: "Use the 'ifDefined' directive?",
				fix:        () => ({
					message: `Use the 'ifDefined' directive.`,
					actions: [ { kind: 'changeAssignment', assignment, newValue: `ifDefined(${ assignment.expression.getText() })` } ],
				}),
			});
		}
	},
};
export default rule;
