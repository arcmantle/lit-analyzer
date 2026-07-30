import { DEFAULT_GENERIC_PARAMETER_TYPE } from '../constants.js';
import { SimpleType, SimpleTypeGenericArguments, SimpleTypeGenericParameter } from '../simple-type.js';
import { getGenericTarget } from './get-generic-target.js';
import { extendTypeParameterMap } from './simple-type-util.js';

export function resolveType(simpleType: SimpleType, parameterMap: Map<string, SimpleType> = new Map()): Exclude<SimpleType, SimpleTypeGenericParameter | SimpleTypeGenericArguments> {
	switch (simpleType.kind) {
	case 'GENERIC_PARAMETER': {
		const resolvedArgument = parameterMap?.get(simpleType.name);

		return resolveType(resolvedArgument || /*simpleType.default ||*/ DEFAULT_GENERIC_PARAMETER_TYPE, parameterMap);
	}
	case 'GENERIC_ARGUMENTS': {
		const updatedGenericParameterMap = extendTypeParameterMap(simpleType, parameterMap);

		return resolveType(getGenericTarget(simpleType), updatedGenericParameterMap);
	}
	default:
		return simpleType;
	}
}
