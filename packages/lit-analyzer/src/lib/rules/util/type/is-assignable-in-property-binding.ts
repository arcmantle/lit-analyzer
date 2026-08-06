import { Type } from 'typescript';

import { HtmlNodeAttr } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { rangeFromHtmlNodeAttr } from '../../../analyze/util/range-util.js';
import { isAssignableBindingUnderSecuritySystem } from './is-assignable-binding-under-security-system.js';
import { isAssignableToType } from './is-assignable-to-type.js';
import { typeToDisplayString } from './type-utils.js';

export function isAssignableInPropertyBinding(
	htmlAttr: HtmlNodeAttr,
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean | undefined {
	const securitySystemResult = isAssignableBindingUnderSecuritySystem(htmlAttr, { typeA, typeB }, context);
	if (securitySystemResult !== undefined) {
		// The security diagnostics take precedence here,
		//   and we should not do any more checking.
		return securitySystemResult;
	}

	if (!isAssignableToType({ typeA, typeB }, context)) {
		context.report({
			location: rangeFromHtmlNodeAttr(htmlAttr),
			message:  `Type '${ typeToDisplayString(typeB, context.program.getTypeChecker()) }' `
			+ `is not assignable to '${ typeToDisplayString(typeA, context.program.getTypeChecker()) }'`,
		});

		return false;
	}

	return true;
}
