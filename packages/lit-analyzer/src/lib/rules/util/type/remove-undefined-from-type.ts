import { getGenericTarget, isAssignableToSimpleTypeKind, SimpleType } from 'ts-simple-type';

export function removeUndefinedFromType(type: SimpleType): SimpleType {
	switch (type.kind) {
	case 'ALIAS':
	case 'GENERIC_ARGUMENTS':
		return {
			...type,
			target: removeUndefinedFromType(getGenericTarget(type)),
		};
	case 'UNION':
		return {
			...type,
			types: type.types.filter(t => !isAssignableToSimpleTypeKind(t, 'UNDEFINED')),
		};
	}

	return type;
}
