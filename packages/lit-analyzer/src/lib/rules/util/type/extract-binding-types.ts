import {
	isSimpleType,
	SimpleType,
	SimpleTypeBooleanLiteral,
	SimpleTypeString,
	SimpleTypeStringLiteral,
	toSimpleType,
} from 'ts-simple-type';
import { Expression, Type, TypeChecker } from 'typescript';

import { HtmlNodeAttrAssignment, HtmlNodeAttrAssignmentKind } from '../../../analyze/types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttrKind } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { getDirective } from '../directive/get-directive.js';

const cache: WeakMap<HtmlNodeAttrAssignment, { typeA: SimpleType; typeB: SimpleType; }> = new WeakMap();

export function extractBindingTypes(
	assignment: HtmlNodeAttrAssignment,
	context: RuleModuleContext,
): { typeA: SimpleType; typeB: SimpleType; } {
	if (cache.has(assignment))
		return cache.get(assignment)!;


	const checker = context.program.getTypeChecker();

	// Infer the type of the RHS
	const typeBInferred = inferTypeFromAssignment(assignment, checker);

	// Convert typeB to SimpleType
	let typeB = isSimpleType(typeBInferred) ? typeBInferred : toSimpleType(typeBInferred, checker);

	// Find a corresponding target for this attribute
	const htmlAttrTarget = context.htmlStore.getHtmlAttrTarget(assignment.htmlAttr);
	//if (htmlAttrTarget == null) return [];

	const typeA = htmlAttrTarget == null ? ({ kind: 'ANY' } as SimpleType) : htmlAttrTarget.getType(checker);

	// Handle directives
	const directive = getDirective(assignment, context);
	const directiveType = directive?.actualType?.();
	if (directiveType != null)
		typeB = directiveType;


	// Cache the result
	const result = { typeA, typeB };
	cache.set(assignment, result);

	return result;
}

export function inferTypeFromAssignment(assignment: HtmlNodeAttrAssignment, checker: TypeChecker): SimpleType | Type {
	switch (assignment.kind) {
	case HtmlNodeAttrAssignmentKind.STRING:
		return { kind: 'STRING_LITERAL', value: assignment.value } as SimpleTypeStringLiteral;
	case HtmlNodeAttrAssignmentKind.BOOLEAN:
		return { kind: 'BOOLEAN_LITERAL', value: true } as SimpleTypeBooleanLiteral;
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

		return { kind: 'STRING' } as SimpleTypeString;
	}
}
