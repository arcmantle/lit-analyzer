import { Expression, Type, TypeChecker } from 'typescript';

import { HtmlNodeAttrAssignment, HtmlNodeAttrAssignmentKind } from '../../../analyze/types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttrKind } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { BindingTypes, RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { getDirective } from '../directive/get-directive.js';

export function extractBindingTypes(
	assignment: HtmlNodeAttrAssignment,
	context: RuleModuleContext,
): BindingTypes {
	const cachedTypes = context.bindingTypes?.get(assignment);
	if (cachedTypes != null)
		return cachedTypes;

	const checker = context.program.getTypeChecker();

	// Infer the type of the RHS
	let typeB = inferTypeFromAssignment(assignment, checker);

	// Find a corresponding target for this attribute
	const htmlAttrTarget = context.htmlStore.getHtmlAttrTarget(assignment.htmlAttr);

	const typeA = htmlAttrTarget == null
		? checker.getAnyType()
		: htmlAttrTarget.getType(checker);

	// Handle directives
	const directive = getDirective(assignment, context);
	const directiveType = directive?.actualType?.();
	if (directiveType != null)
		typeB = directiveType;

	const bindingTypes = { typeA, typeB };
	context.bindingTypes?.set(assignment, bindingTypes);

	return bindingTypes;
}


export function inferTypeFromAssignment(assignment: HtmlNodeAttrAssignment, checker: TypeChecker): Type {
	switch (assignment.kind) {
	case HtmlNodeAttrAssignmentKind.STRING:
		return checker.getStringLiteralType(assignment.value);
	case HtmlNodeAttrAssignmentKind.BOOLEAN:
		return checker.getTrueType();
	case HtmlNodeAttrAssignmentKind.ELEMENT_EXPRESSION:
		return checker.getTypeAtLocation(assignment.expression);
	case HtmlNodeAttrAssignmentKind.EXPRESSION:
		return checker.getTypeAtLocation(assignment.expression);
	case HtmlNodeAttrAssignmentKind.MIXED:
		// Event bindings always looks at the first expression
		// Therefore, return the type of the first expression
		if (assignment.htmlAttr.kind === HtmlNodeAttrKind.EVENT_LISTENER) {
			const expression = assignment.values.find((val): val is Expression => typeof val !== 'string');

			if (expression != null)
				return checker.getTypeAtLocation(expression);
		}

		return checker.getStringType();
	}
}
