import { Type, TypeFlags } from 'typescript';

import { HtmlNodeAttr } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { rangeFromHtmlNodeAttr } from '../../../analyze/util/range-util.js';
import { isLit1DirectiveTypeInternal, isLit2DirectiveType } from '../directive/is-lit-directive.js';
import { typeToDisplayString } from './type-utils.js';

/**
 * Checks that the type represents a Lit 2 directive, which is the only valid
 * value for element expressions.
 */
export function isAssignableInElementBinding(
	htmlAttr: HtmlNodeAttr,
	type: Type,
	context: RuleModuleContext,
): boolean | undefined {
	const checker = context.program.getTypeChecker();
	const isLit2 = isLit2DirectiveType(type);
	const isLit1 = isLit1DirectiveTypeInternal(type, checker);
	const isAny = (type.flags & TypeFlags.Any) !== 0;

	// TODO (justinfagnani): is there a better way to determine if the
	// type *contains* any, rather than *is* any?
	if (!isLit2 && !isAny) {
		if (isLit1) {
			context.report({
				location: rangeFromHtmlNodeAttr(htmlAttr),
				message:  `Type '${ typeToDisplayString(type, checker) }' is a lit-html 1.0 directive, not a Lit 2 directive'`,
			});
		}
		else {
			context.report({
				location: rangeFromHtmlNodeAttr(htmlAttr),
				message:  `Type '${ typeToDisplayString(type, checker) }' is not a Lit 2 directive'`,
			});
		}

		return false;
	}

	return true;
}
