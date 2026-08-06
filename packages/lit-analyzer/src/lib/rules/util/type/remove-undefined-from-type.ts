import { Type, TypeChecker, TypeFlags } from 'typescript';

export function removeUndefinedFromType(type: Type, checker: TypeChecker): Type {
	const containsNull = (type.isUnion() ? type.types : [ type ])
		.some(member => (member.flags & TypeFlags.Null) !== 0);

	const nonNullableType = checker.getNonNullableType(type);

	return containsNull
		? checker.getNullableType(nonNullableType, TypeFlags.Null)
		: nonNullableType;
}
