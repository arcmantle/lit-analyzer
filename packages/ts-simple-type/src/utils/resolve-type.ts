import { SimpleType, SimpleTypeGenericArguments, SimpleTypeGenericParameter } from '../simple-type.js';
import { getGenericTarget } from './get-generic-target.js';
import { resolveGenericParameter } from './resolve-generic-parameter.js';
import { extendTypeParameterMap } from './simple-type-util.js';

export function resolveType(simpleType: SimpleType, parameterMap: Map<string, SimpleType> = new Map()): Exclude<SimpleType, SimpleTypeGenericParameter | SimpleTypeGenericArguments> {
	switch (simpleType.kind) {
	case 'GENERIC_PARAMETER': {
		// This walk has no assignability direction, so it takes the wildcard that the target position always gives.
		return resolveType(resolveGenericParameter(simpleType, parameterMap, 'target'), parameterMap);
	}
	case 'GENERIC_ARGUMENTS': {
		const updatedGenericParameterMap = extendTypeParameterMap(simpleType, parameterMap);

		return resolveType(getGenericTarget(simpleType), updatedGenericParameterMap);
	}
	default:
		return simpleType;
	}
}
