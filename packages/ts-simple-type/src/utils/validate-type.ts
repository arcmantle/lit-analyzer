import { SimpleType } from '../simple-type.js';
import { getGenericTarget } from './get-generic-target.js';
import { and, or } from './list-util.js';
import { resolveGenericParameter } from './resolve-generic-parameter.js';
import { extendTypeParameterMap } from './simple-type-util.js';

export function validateType(type: SimpleType, callback: (simpleType: SimpleType) => boolean | undefined | void): boolean {
	return validateTypeInternal(type, callback, new Map());
}

function validateTypeInternal(type: SimpleType, callback: (simpleType: SimpleType) => boolean | undefined | void, parameterMap: Map<string, SimpleType>): boolean {
	const res = callback(type);

	if (res != null)
		return res;


	switch (type.kind) {
	case 'ENUM':
	case 'UNION': {
		return or(type.types, childType => validateTypeInternal(childType, callback, parameterMap));
	}

	case 'ALIAS': {
		return validateTypeInternal(getGenericTarget(type), callback, parameterMap);
	}

	case 'INTERSECTION': {
		return and(type.types, childType => validateTypeInternal(childType, callback, parameterMap));
	}

	case 'GENERIC_PARAMETER': {
		// This walk has no assignability direction, so it takes the wildcard that the target position always gives.
		return validateTypeInternal(resolveGenericParameter(type, parameterMap, 'target'), callback, parameterMap);
	}

	case 'GENERIC_ARGUMENTS': {
		const updatedGenericParameterMap = extendTypeParameterMap(type, parameterMap);

		return validateTypeInternal(getGenericTarget(type), callback, updatedGenericParameterMap);
	}
	}

	return false;
}
