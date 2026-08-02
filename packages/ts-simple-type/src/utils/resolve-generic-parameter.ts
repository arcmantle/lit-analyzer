import { WILDCARD_TYPE } from '../constants.js';
import { SimpleType, SimpleTypeGenericParameter } from '../simple-type.js';
import { getGenericParameterKey } from './get-generic-parameter-key.js';

export type GenericParameterPosition = 'source' | 'target';

/**
 * Resolves a generic parameter: its argument in the map, else its constraint in source position, else a wildcard.
 *
 * The constraint is returned unresolved on purpose. A constraint can refer to another parameter, as in
 * `T extends Array<U>`, and the caller continues the walk with the same map, which resolves `U` there.
 *
 * A constraint is an upper bound, so it is sound in source position only. See ADR_5VGWXCBV5K8C6TS4FPZ28XMQD0.
 */
export function resolveGenericParameter(
	parameter: SimpleTypeGenericParameter,
	parameterMap: Map<string, SimpleType>,
	position: GenericParameterPosition,
): SimpleType {
	const resolvedArgument = parameterMap.get(getGenericParameterKey(parameter));

	if (resolvedArgument != null)
		return resolvedArgument;


	if (position === 'source' && parameter.constraint != null)
		return parameter.constraint;


	return WILDCARD_TYPE;
}
