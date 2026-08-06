import { Expression, Type } from 'typescript';

import { HtmlNodeAttrAssignment, HtmlNodeAttrAssignmentKind } from '../../../analyze/types/html-node/html-node-attr-assignment-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { removeUndefinedFromType } from '../type/remove-undefined-from-type.js';
import { getLitDirectiveTypeArgument, isLitDirectiveType } from './is-lit-directive.js';

export type BuiltInDirectiveKind =
	| 'ifDefined'
	| 'guard'
	| 'classMap'
	| 'styleMap'
	| 'unsafeHTML'
	| 'cache'
	| 'repeat'
	| 'live'
	| 'templateContent'
	| 'unsafeSVG'
	| 'asyncReplace'
	| 'asyncAppend';

export interface UserDefinedDirectiveKind {
	name: string;
}

interface Directive {
	kind:        BuiltInDirectiveKind | UserDefinedDirectiveKind;
	actualType?: () => Type | undefined;
	args:        Expression[];
}

export function getDirective(assignment: HtmlNodeAttrAssignment, context: RuleModuleContext): Directive | undefined {
	const { ts, program } = context;
	const checker = program.getTypeChecker();

	if (assignment.kind !== HtmlNodeAttrAssignmentKind.EXPRESSION)
		return;

	// Type check lit-html directives
	if (ts.isCallExpression(assignment.expression)) {
		const functionName = assignment.expression.expression.getText();
		const args = Array.from(assignment.expression.arguments);

		switch (functionName) {
		case 'ifDefined': {
			// Example: html`<img src="${ifDefined(imageUrl)}">`;
			// Take the argument to ifDefined and remove undefined from the type union (if possible).
			// This new type becomes the actual type of the expression
			const actualType = args.length >= 1
				? () => removeUndefinedFromType(checker.getTypeAtLocation(args[0]), checker)
				: undefined;

			return {
				kind: 'ifDefined',
				actualType,
				args,
			};
		}

		case 'live': {
			// Example: html`<input .value=${live(x)}>`
			// The actual type will be the type of the first argument to live
			const actualType = args.length >= 1
				? () => checker.getTypeAtLocation(args[0])
				: undefined;

			return {
				kind: 'live',
				actualType,
				args,
			};
		}

		case 'guard': {
			// Example: html`<img src="${guard([imageUrl], () => Math.random() > 0.5 ? imageUrl : "nothing.png")}>`;
			// The return type of the function becomes the actual type of the expression
			const actualType = args.length >= 2
				? () => {
					const returnFunctionType = checker.getTypeAtLocation(args[1]);
					const signature = checker.getSignaturesOfType(returnFunctionType, ts.SignatureKind.Call)[0];

					return signature?.getReturnType();
				}
				: undefined;

			return {
				kind: 'guard',
				actualType,
				args,
			};
		}

		case 'classMap':
		case 'styleMap':
			return {
				kind:       functionName,
				actualType: () => checker.getStringType(),
				args,
			};

		case 'unsafeHTML':
		case 'unsafeSVG':
		case 'cache':
		case 'repeat':
		case 'templateContent':
		case 'asyncReplace':
		case 'asyncAppend':
			return {
				kind: functionName,
				args,
			};

		default:
			// Inspect the directive result through the checker.
			if (assignment.kind === HtmlNodeAttrAssignmentKind.EXPRESSION) {
				const typeB = checker.getTypeAtLocation(assignment.expression);

				if (isLitDirectiveType(typeB, checker)) {
					// Factories can mark which parameters might be assigned to the property with the generic type in DirectiveFn<T>
					// Here we get the actual type of the directive if it is a generic directive with type. Example: DirectiveFn<string>
					// Read more: https://github.com/Polymer/lit-html/pull/1151
					const actualType = () => getLitDirectiveTypeArgument(typeB, checker);

					// Now we have an unknown (user defined) directive.
					return {
						kind: {
							name: functionName,
						},
						args,
						actualType,
					};
				}
			}
		}
	}

	return;
}
