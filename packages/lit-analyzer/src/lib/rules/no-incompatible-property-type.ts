import { Node, ObjectFlags, Type, TypeChecker, TypeFlags } from 'typescript';
import { LitElementPropertyConfig } from '@arcmantle/web-component-analyzer';

import { RuleModule } from '../analyze/types/rule/rule-module.js';
import { RuleModuleContext } from '../analyze/types/rule/rule-module-context.js';
import { joinArray } from '../analyze/util/array-util.js';
import { lazy } from '../analyze/util/general-util.js';
import { rangeFromNode } from '../analyze/util/range-util.js';

const rule: RuleModule = {
	id:   'no-incompatible-property-type',
	meta: {
		priority: 'low',
	},
	visitComponentMember(member, context) {
		if (member.kind !== 'property' || member.modifiers?.has('static') || member.meta == null)
			return;

		if ((member.meta.node?.type ?? member.node)?.getSourceFile() !== context.file)
			return;

		// Grab the type and fallback to "any"
		const checker = context.program.getTypeChecker();
		const type = member.type?.(checker) || checker.getAnyType();

		return validateLitPropertyConfig(
			member.meta.node?.type || member.meta.node?.decorator?.expression || member.node,
			member.meta,
			{
				propName: member.propName,
				propType: type,
			},
			context,
		);
	},
};

const LIT_PROPERTY_TYPE_KINDS = [ 'STRING', 'NUMBER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'ANY' ] as const;
type LitPropertyTypeKind = (typeof LIT_PROPERTY_TYPE_KINDS)[number];
export type { LitPropertyTypeKind };

function assertNever(value: never): never {
	throw new Error(`Unexpected Lit property type kind: ${ value }`);
}

/**
 * Returns a string, that can be used in a lit @property decorator for the type key, representing the simple type kind.
 * @param simpleTypeKind
 */
function toLitPropertyTypeString(simpleTypeKind: LitPropertyTypeKind): string {
	switch (simpleTypeKind) {
	case 'STRING':
		return 'String';
	case 'NUMBER':
		return 'Number';
	case 'BOOLEAN':
		return 'Boolean';
	case 'ARRAY':
		return 'Array';
	case 'OBJECT':
		return 'Object';
	case 'ANY':
		return 'Any';
	}

	return assertNever(simpleTypeKind);
}

function getLitPropertyTypeKind(type: Type, checker: TypeChecker): LitPropertyTypeKind | undefined {
	return LIT_PROPERTY_TYPE_KINDS
		.filter((kind): kind is Exclude<LitPropertyTypeKind, 'ANY'> => kind !== 'ANY')
		.find(kind => matchesTypeKind(type, kind, checker));
}

/**
 * Prepares functions that can lazily test assignability against simple type kinds.
 * This tester function uses a cache for performance.
 * @param type
 */
function prepareAssignabilityTester(type: Type, checker: TypeChecker): {
	isAssignableTo:    (kind: LitPropertyTypeKind) => boolean;
	acceptedTypeKinds: () => LitPropertyTypeKind[];
} {
	// Test assignments to all possible type kinds
	const _isAssignableToCache: Map<LitPropertyTypeKind, boolean> = new Map();
	function isAssignableTo(simpleTypeKind: LitPropertyTypeKind): boolean {
		if (_isAssignableToCache.has(simpleTypeKind))
			return _isAssignableToCache.get(simpleTypeKind)!;


		const result = (() => {
			switch (simpleTypeKind) {
			case 'STRING':
				return matchesTypeKind(type, 'STRING', checker);
			case 'NUMBER':
				return matchesTypeKind(type, 'NUMBER', checker);
			case 'BOOLEAN':
				return matchesTypeKind(type, 'BOOLEAN', checker);
			case 'ARRAY':
				return matchesTypeKind(type, 'ARRAY', checker);
			case 'OBJECT':
				return matchesTypeKind(type, 'OBJECT', checker);
			case 'ANY':
				return matchesTypeKind(type, 'ANY', checker);
			}

			return assertNever(simpleTypeKind);
		})();

		_isAssignableToCache.set(simpleTypeKind, result);

		return result;
	}

	// Collect type kinds that can be used in as "type" in the @property decorator
	const acceptedTypeKinds = lazy(() => {
		return LIT_PROPERTY_TYPE_KINDS
			.filter(kind => kind !== 'ANY')
			.filter(kind => isAssignableTo(kind));
	});

	return { acceptedTypeKinds, isAssignableTo };
}

function matchesTypeKind(type: Type, kind: LitPropertyTypeKind, checker: TypeChecker): boolean {
	if (type.isUnion())
		return type.types.some(member => matchesTypeKind(member, kind, checker));

	if (type.isIntersection())
		return type.types.every(member => matchesTypeKind(member, kind, checker));

	switch (kind) {
	case 'STRING':
		return (type.flags & TypeFlags.StringLike) !== 0;
	case 'NUMBER':
		return (type.flags & TypeFlags.NumberLike) !== 0;
	case 'BOOLEAN':
		return (type.flags & TypeFlags.BooleanLike) !== 0;
	case 'ARRAY':
		return checker.isArrayType(type) || checker.isTupleType(type);
	case 'OBJECT':
		return isObjectConverterType(type, checker);
	case 'ANY':
		return isAnyConverterType(type, checker);
	}

	return assertNever(kind);
}

function isAnyConverterType(type: Type, checker: TypeChecker): boolean {
	if ((type.flags & TypeFlags.Any) !== 0)
		return true;

	return isObjectConverterType(type, checker)
		&& checker.getPropertiesOfType(type).length === 0;
}

function isObjectConverterType(type: Type, checker: TypeChecker): boolean {
	if ((type.flags & TypeFlags.Object) === 0 || (type.flags & TypeFlags.NonPrimitive) !== 0)
		return false;

	if (checker.isArrayType(type) || checker.isTupleType(type))
		return false;

	const symbolName = type.getSymbol()?.getName();
	if (symbolName === 'Date' || symbolName === 'Promise' || symbolName === 'PromiseLike')
		return false;

	// Class and function types are not handled by Lit's Object converter.
	if (
		type.isClass()
		|| (!type.isClassOrInterface() && type.getCallSignatures().length > 0)
	)
		return false;

	return true;
}

/**
 * Runs through a lit configuration and validates against the property type.
 * Emits diagnostics through the context.
 * @param node
 * @param litConfig
 * @param propName
 * @param propType
 * @param context
 */
function validateLitPropertyConfig(
	node: Node,
	litConfig: LitElementPropertyConfig,
	{ propName, propType }: { propName: string; propType: Type; },
	context: RuleModuleContext,
) {
	const checker = context.program.getTypeChecker();
	// Check if "type" is one of the built in default type converter hint
	if (typeof litConfig.type === 'string' && !litConfig.hasConverter) {
		context.report({
			location:   rangeFromNode(node),
			message:    `'${ litConfig.type }' is not a valid type for the default converter.`,
			fixMessage: litConfig.attribute !== false
				? "Have you considered '{attribute: false}' instead?"
				: "Have you considered removing 'type'?",
		});
	}

	// Don't continue if we don't know the property type (eg if we are in a js file)
	// Don't continue if this property has a custom converter (because then we don't know how the value will be converted)
	if (litConfig.hasConverter || typeof litConfig.type === 'string')
		return;


	const { acceptedTypeKinds, isAssignableTo } = prepareAssignabilityTester(propType, checker);

	// Test the @property type against the actual type if a type has been provided
	if (litConfig.type != null) {
		const configuredTypeKind = getLitPropertyTypeKind(litConfig.type, checker);
		if (configuredTypeKind == null)
			return;

		// Report error if the @property type is not assignable to the actual type
		if (!isAssignableTo(configuredTypeKind) && !isAssignableTo('ANY')) {
			// Suggest what to use instead
			if (acceptedTypeKinds().length >= 1) {
				const potentialKindText = joinArray(
					acceptedTypeKinds().map(kind => `'${ toLitPropertyTypeString(kind) }'`),
					', ',
					'or',
				);

				context.report({
					location: rangeFromNode(node),
					message:  `@property type should be ${ potentialKindText } instead of \
'${ toLitPropertyTypeString(configuredTypeKind) }'`,
				});
			}

			// If no suggesting can be provided, report that they are not assignable
			// The OBJECT @property type is an escape from this error
			else if (configuredTypeKind !== 'OBJECT') {
				context.report({
					location: rangeFromNode(node),
					message:  `@property type '${ toLitPropertyTypeString(configuredTypeKind) }' is not assignable to the actual \
type '${ checker.typeToString(propType) }'`,
				});
			}
		}
	}

	// If no type has been specified, suggest what to use as the @property type
	else if (litConfig.attribute !== false) {
		// Don't do anything if there are multiple possibilities for a type.
		if (isAssignableTo('ANY')) {
			return;
		}

		// Don't report errors because String conversion is default
		else if (isAssignableTo('STRING')) {
			return;
		}

		// Suggest what to use instead if there are multiple accepted @property types for this property
		else if (acceptedTypeKinds().length > 0) {
			// Suggest types to use and include "{attribute: false}" if the @property type is ARRAY or OBJECT
			const acceptedTypeText = joinArray(
				[
					...acceptedTypeKinds().map(kind => `'{type: ${ toLitPropertyTypeString(kind) }}'`),
					...(isAssignableTo('ARRAY') || isAssignableTo('OBJECT') ? [ "'{attribute: false}'" ] : []),
				],
				', ',
				'or',
			);

			context.report({
				location: rangeFromNode(node),
				message:  `Missing ${ acceptedTypeText } on @property decorator for '${ propName }'`,
			});
		}
		else {
			context.report({
				location:   rangeFromNode(node),
				message:    `The built in converter doesn't handle the property type '${ checker.typeToString(propType) }'.`,
				fixMessage: `Please add '{attribute: false}' on @property decorator for '${ propName }'`,
			});
		}
	}

	// message: `You need to add '{attribute: false}' to @property decorator for '${propName}' because
	// '${ checker.typeToString(propType) }' type is not a primitive`
}

export default rule;
