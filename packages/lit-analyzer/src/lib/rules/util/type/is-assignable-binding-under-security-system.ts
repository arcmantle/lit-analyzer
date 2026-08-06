import { Type, TypeChecker, TypeFlags } from 'typescript';

import { HtmlNodeAttr } from '../../../analyze/types/html-node/html-node-attr-types.js';
import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { rangeFromHtmlNodeAttr } from '../../../analyze/util/range-util.js';
import { isLitDirectiveType } from '../directive/is-lit-directive.js';
import { hasFlag, typeToDisplayString } from './type-utils.js';

/**
 * If the user's security policy overrides normal type checking for this
 * attribute binding, returns a (possibly empty) array of diagnostics.
 *
 * If the security policy does not apply to this binding, then
 */
export function isAssignableBindingUnderSecuritySystem(
	htmlAttr: HtmlNodeAttr,
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean | undefined {
	const securityPolicy = context.config.securitySystem;
	switch (securityPolicy) {
	case 'off':
		return undefined; // No security checks apply.
	case 'ClosureSafeTypes':
		return checkClosureSecurityAssignability(typeB, htmlAttr, context, context.program.getTypeChecker());
	default: {
		const never: never = securityPolicy;
		context.logger.error(`Unexpected security policy: ${ never }`);

		return undefined;
	}
	}
}

interface TagNameToSecurityOverrideMap {
	[tagName: string]: SecurityOverrideMap | undefined;
}

// A map from attribute/property names to an array of type names.
// Assignments to the given attribute must match one of the given types.
interface SecurityOverrideMap {
	[attributeName: string]: string[] | undefined;
}

const closureScopedOverrides: TagNameToSecurityOverrideMap = {
	iframe: {
		src: [ 'TrustedResourceUrl' ],
	},
	a: {
		href: [ 'TrustedResourceUrl', 'SafeUrl', 'string' ],
	},
	img: {
		src: [ 'TrustedResourceUrl', 'SafeUrl', 'string' ],
	},
	script: {
		src: [ 'TrustedResourceUrl' ],
	},
	source: {
		src: [ 'TrustedResourceUrl', 'SafeUrl' ],
	},
};
const closureGlobalOverrides: SecurityOverrideMap = {
	style: [ 'SafeStyle', 'string' ],
};

function checkClosureSecurityAssignability(
	typeB: Type,
	htmlAttr: HtmlNodeAttr,
	context: RuleModuleContext,
	checker: TypeChecker,
): boolean | undefined {
	const scopedOverride = closureScopedOverrides[htmlAttr.htmlNode.tagName];
	const overriddenTypes = (scopedOverride && scopedOverride[htmlAttr.name]) || closureGlobalOverrides[htmlAttr.name];
	if (overriddenTypes === undefined)
		return undefined;

	// `any` is allowed to bind to anything.
	if ((typeB.flags & TypeFlags.Any) !== 0)
		return undefined;

	// Directives are responsible for their own security.
	if (isLitDirectiveType(typeB, checker))
		return undefined;


	const typeMatch = matchesAtLeastOneNominalType(overriddenTypes, typeB);
	if (typeMatch === false) {
		context.report({
			location: rangeFromHtmlNodeAttr(htmlAttr),
			message:  `Type '${ typeToDisplayString(typeB, checker) }' `
			+ `is not assignable to '${ overriddenTypes.join(' | ') }'. `
			+ `This is due to Closure Safe Type enforcement.`,
		});

		return false;
	}

	return true;
}

function normalizeTypeName(typeName: string) {
	// Attempt to take a clutz type name for a goog.module type, which looks like
	// module$contents$goog$html$SafeUrl_SafeUrl and extract the
	// actual type name (SafeUrl in that case)
	const match = typeName.match(/module\$.*_(.*)/);
	if (match == null)
		return undefined;

	return match[1];
}

function matchesAtLeastOneNominalType(typeNames: string[], typeB: Type): boolean {
	const typeBName = typeB.aliasSymbol?.getName() ?? typeB.getSymbol()?.getName();
	if (typeBName != null && (typeNames.includes(typeBName) || typeNames.includes(normalizeTypeName(typeBName) || '')))
		return true;

	if (typeB.isUnion())
		return typeB.types.every(type => matchesAtLeastOneNominalType(typeNames, type));

	return hasFlag(typeB, TypeFlags.StringLike) && typeNames.includes('string');
}
