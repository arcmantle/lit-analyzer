import { getGenericTarget, isSimpleType, SimpleType, typeToString } from 'ts-simple-type';
import { Type, TypeChecker, TypeFormatFlags } from 'typescript';

import { TransformerConfig } from '../transformers/transformer-config.js';

/**
 * Returns a "type hint" from a type
 * The type hint is an easy to read representation of the type and is not made for being parsed.
 * @param type
 * @param checker
 * @param config
 */
export function getTypeHintFromType(
	type: string | Type | SimpleType | undefined,
	checker: TypeChecker,
	config: TransformerConfig,
): string | undefined {
	if (type == null)
		return undefined;
	if (typeof type === 'string')
		return type;

	let typeHint: string;

	if (config.inlineTypes) {
		// Inline aliased types
		if (isSimpleType(type)) {
			// Expand a possible alias
			if (isUnionTypeAlias(type))
				type = unwrapGenericWrappers(type);


			typeHint = typeToString(type);
		}
		else {
			// Transform using Typescript natively, to avoid transforming all types to simple types (overhead).
			// The "InTypeAlias" flag expands the type.
			typeHint = checker.typeToString(type, undefined, TypeFormatFlags.InTypeAlias);
		}
	}
	else {
		// Transform types to string
		typeHint = typeToString(type, checker);
	}

	// Replace "anys" and "{}" with more human friendly representations
	if (typeHint === 'any')
		return undefined;
	if (typeHint === 'any[]')
		return 'array';
	if (typeHint === '{}')
		return 'object';

	// "CustomEvent<unknown>" and "Event" of no interest
	if (typeHint === 'CustomEvent<unknown>' || typeHint === 'Event')
		return undefined;

	return typeHint;
}

/**
 * Removes every generic wrapper node, so that a generic alias and a plain alias
 * both give the type they wrap.
 */
function unwrapGenericWrappers(simpleType: SimpleType): SimpleType {
	let current = simpleType;
	let target = getGenericTarget(current);
	while (target != null) {
		current = target;
		target = getGenericTarget(current);
	}

	return current;
}

/**
 * Checks if a type is a type alias simple type
 * @param simpleType
 */
function isUnionTypeAlias(simpleType: SimpleType): boolean {
	if (simpleType.kind !== 'ALIAS' && simpleType.kind !== 'GENERIC_ARGUMENTS')
		return false;

	return unwrapGenericWrappers(simpleType).kind === 'UNION';
}
