import { ObjectFlags, Type, TypeChecker, TypeFlags, TypeReference } from 'typescript';

type InternalTypeChecker = TypeChecker & {
	getUnionType(types: readonly Type[]): Type;
};

// A union matches when any member has the requested flag.
export function hasFlag(type: Type, flag: TypeFlags): boolean {
	return (type.flags & flag) !== 0 || (type.isUnion() && type.types.some(member => hasFlag(member, flag)));
}

export function getUnionType(checker: TypeChecker, types: readonly Type[]): Type {
	return (checker as InternalTypeChecker).getUnionType(types);
}

export function isTypeReference(type: Type): type is TypeReference {
	return (type.flags & TypeFlags.Object) !== 0
		&& 'objectFlags' in type
		&& typeof type.objectFlags === 'number'
		&& (type.objectFlags & ObjectFlags.Reference) !== 0;
}
