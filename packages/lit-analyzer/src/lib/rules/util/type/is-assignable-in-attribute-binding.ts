import { Type, TypeChecker, TypeFlags } from 'typescript';

import { HtmlNodeAttrAssignment, HtmlNodeAttrAssignmentKind } from '../../../analyze/types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttr } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { documentRangeToSFRange, rangeFromHtmlNodeAttr } from '../../../analyze/util/range-util.js';
import { isLitDirectiveType } from '../directive/is-lit-directive.js';
import { isAssignableBindingUnderSecuritySystem } from './is-assignable-binding-under-security-system.js';
import { isAssignableToType } from './is-assignable-to-type.js';
import { isUnionType, typeToDisplayString } from './type-utils.js';

export function isAssignableInAttributeBinding(
	htmlAttr: HtmlNodeAttr,
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean | undefined {
	const { assignment } = htmlAttr;
	if (assignment == null)
		return undefined;

	if (assignment.kind === HtmlNodeAttrAssignmentKind.BOOLEAN) {
		if (!isAssignableToType({ typeA, typeB }, context)) {
			context.report({
				location: rangeFromHtmlNodeAttr(htmlAttr),
				message:  `Type '${ typeToDisplayString(typeB, context.program.getTypeChecker()) }' `
				+ `is not assignable to '${ typeToDisplayString(typeA, context.program.getTypeChecker()) }'`,
			});

			return false;
		}
	}
	else {
		if (assignment.kind !== HtmlNodeAttrAssignmentKind.STRING) {
			// Purely static attributes are never security checked, they're handled
			// in the lit-html internals as trusted by default, because they can
			// not contain untrusted data, they were written by the developer.
			//
			// For everything else, we may need to apply a different type comparison
			// for some security-sensitive built in attributes and properties (like
			// <script src>).
			const securitySystemResult = isAssignableBindingUnderSecuritySystem(htmlAttr, { typeA, typeB }, context);
			if (securitySystemResult !== undefined) {
				// The security diagnostics take precedence here,
				// and we should not do any more checking.
				return securitySystemResult;
			}
		}

		const primitiveArrayTypeResult = isAssignableInPrimitiveArray(assignment, { typeA, typeB }, context);
		if (primitiveArrayTypeResult !== undefined)
			return primitiveArrayTypeResult;


		const checker = context.program.getTypeChecker();
		if (isLitDirectiveType(typeB, checker))
			return true;

		if (!isAssignableToTypeWithStringCoercion(typeA, typeB, checker)) {
			context.report({
				location: rangeFromHtmlNodeAttr(htmlAttr),
				message:  `Type '${ typeToDisplayString(typeB, checker) }' is not assignable to `
				+ `'${ typeToDisplayString(typeA, checker) }'`,
			});

			return false;
		}
	}

	return true;
}

/**
 * Assignability check that simulates string coercion
 * This is used to type check attribute bindings
 * @param typeA
 * @param typeB
 * @param options
 */
export function isAssignableToTypeWithStringCoercion(
	typeA: Type,
	typeB: Type,
	checker: TypeChecker,
): boolean {
	if (isObviouslyAssignableWithStringCoercion(typeA, typeB))
		return true;

	// A union is assignable only when every member is assignable after coercion.
	if (isUnionType(typeB))
		return typeB.types.every(member => isAssignableToTypeWithStringCoercion(typeA, member, checker));

	if (typeB.isStringLiteral()) {
		const value = typeB.value;

		// An empty attribute value is the string form of true.
		if (value.length === 0 && checker.isTypeAssignableTo(checker.getTrueType(), typeA))
			return true;

		// Numeric string literals can bind to numeric attributes.
		if (!Number.isNaN(Number(value)) && checker.isTypeAssignableTo(checker.getNumberLiteralType(Number(value)), typeA))
			return true;

		return checker.isTypeAssignableTo(typeB, typeA);
	}

	if ((typeB.flags & TypeFlags.BooleanLiteral) !== 0) {
		return checker.isTypeAssignableTo(
			checker.getStringLiteralType(typeB === checker.getTrueType() ? 'true' : 'false'),
			typeA,
		);
	}

	if ((typeB.flags & TypeFlags.BooleanLike) !== 0) {
		// A boolean expression becomes either "true" or "false" in an attribute.
		return checker.isTypeAssignableTo(checker.getStringLiteralType('true'), typeA)
			&& checker.isTypeAssignableTo(checker.getStringLiteralType('false'), typeA);
	}

	if ((typeB.flags & TypeFlags.NumberLike) !== 0) {
		// Keep normal number assignability, and allow stringification for string attributes.
		return checker.isTypeAssignableTo(typeB, typeA)
			|| checker.isTypeAssignableTo(checker.getStringType(), typeA);
	}

	if (isBroadStringType(typeB) && isStringLiteralType(typeA))
		return true;

	if ((typeB.flags & TypeFlags.Object) !== 0 && isObjectCoercible(typeB, checker))
		return checker.isTypeAssignableTo(checker.getStringLiteralType('[object Object]'), typeA);


	return checker.isTypeAssignableTo(typeB, typeA);
}

function isObviouslyAssignableWithStringCoercion(target: Type, source: Type): boolean {
	if (isUnionType(source))
		return source.types.every(member => isObviouslyAssignableWithStringCoercion(target, member));

	const targetAcceptsString = hasBroadPrimitiveTarget(target, TypeFlags.String);
	const targetAcceptsNumber = hasBroadPrimitiveTarget(target, TypeFlags.Number);
	const targetAcceptsBoolean = hasBroadPrimitiveTarget(target, TypeFlags.Boolean);

	if (source.isStringLiteral()) {
		return targetAcceptsString
			|| (!Number.isNaN(Number(source.value)) && targetAcceptsNumber)
			|| (source.value.length === 0 && targetAcceptsBoolean);
	}

	if ((source.flags & TypeFlags.BooleanLike) !== 0)
		return targetAcceptsString;

	if ((source.flags & TypeFlags.NumberLike) !== 0)
		return targetAcceptsString || targetAcceptsNumber;

	return false;
}

function hasBroadPrimitiveTarget(type: Type, flag: TypeFlags): boolean {
	if (isUnionType(type))
		return type.types.some(member => hasBroadPrimitiveTarget(member, flag));

	return (type.flags & flag) !== 0;
}

function isBroadStringType(type: Type): boolean {
	if (type.isIntersection())
		return type.types.some(isBroadStringType);

	return (type.flags & TypeFlags.String) !== 0;
}

function isStringLiteralType(type: Type): boolean {
	if (isUnionType(type))
		return type.types.every(isStringLiteralType);

	return type.isStringLiteral();
}

/**
 * Certain attributes like "role" are string literals, but should be type checked
 *   by comparing each item in the white-space-separated array against typeA
 * @param assignment
 * @param typeA
 * @param typeB
 * @param context
 */
export function isAssignableInPrimitiveArray(
	assignment: HtmlNodeAttrAssignment,
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean | undefined {
	// Only check "STRING" and "EXPRESSION" for now
	if (assignment.kind !== HtmlNodeAttrAssignmentKind.STRING && assignment.kind !== HtmlNodeAttrAssignmentKind.EXPRESSION)
		return undefined;

	const target = context.htmlStore.getHtmlAttrTarget(assignment.htmlAttr);
	if (target == null || !('primitiveArray' in target) || target.primitiveArray !== true)
		return undefined;

	const checker = context.program.getTypeChecker();
	const stringValue = typeB.isStringLiteral() ? typeB.value : undefined;
	if (stringValue != null) {
		// Split a value like: "button listitem" into ["button", " ", "listitem"]
		const valuesAndWhitespace = stringValue.split(/(\s+)/g);
		const valuesNotAssignable: string[] = [];

		const startOffset = assignment.location.start;
		let offset = 0;

		for (const value of valuesAndWhitespace) {
			// Check all non-whitespace values
			if (value.match(/\s+/) == null && value !== '') {
				// Make sure that the the value is assignable to the union
				if (!checker.isTypeAssignableTo(checker.getStringLiteralType(value), typeA)) {
					valuesNotAssignable.push(value);

					// If the assignment kind is "STRING" we can report diagnostics directly on the value in the HTML
					if (assignment.kind === 'STRING') {
						context.report({
							location: documentRangeToSFRange(assignment.htmlAttr.document, {
								start: startOffset + offset,
								end:   startOffset + offset + value.length,
							}),
							message: `The value '${ value }' is not assignable to '${ typeToDisplayString(typeA, checker) }'`,
						});
					}
				}
			}

			offset += value.length;
		}

		// If the assignment kind as "EXPRESSION" report a single diagnostic on the attribute name
		if (assignment.kind === 'EXPRESSION' && valuesNotAssignable.length > 0) {
			const multiple = valuesNotAssignable.length > 1;
			context.report({
				location: rangeFromHtmlNodeAttr(assignment.htmlAttr),
				message:  `The value${ multiple ? 's' : '' } ${ valuesNotAssignable.map(v => `'${ v }'`).join(', ') } ${
					multiple ? 'are' : 'is'
				} not assignable to '${ typeToDisplayString(typeA, context.program.getTypeChecker()) }'`,
			});
		}

		return valuesNotAssignable.length === 0;
	}

	return undefined;
}

function isObjectCoercible(type: Type, checker: TypeChecker): boolean {
	if (checker.isArrayType(type) || checker.isTupleType(type))
		return false;

	const symbolName = type.getSymbol()?.getName();

	return symbolName !== 'Date'
		&& symbolName !== 'Promise'
		&& symbolName !== 'PromiseLike'
		&& type.getCallSignatures().length === 0
		&& type.getConstructSignatures().length === 0;
}
