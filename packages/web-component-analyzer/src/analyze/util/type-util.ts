import { ObjectFlags, SignatureKind, Type, TypeChecker, TypeFlags, TypeReference } from 'typescript';

import { getUnionType, isTypeReference } from './ts-type-util.js';

type TypeWithAliasArguments = Type & {
	aliasTypeArguments?:    readonly Type[];
	resolvedTypeArguments?: readonly Type[];
};

function relaxTypeArguments(type: Type, checker: TypeChecker): Type | undefined {
	const typeArguments = isTypeReference(type)
		? checker.getTypeArguments(type)
		: (type as TypeWithAliasArguments).aliasTypeArguments ?? [];
	if (typeArguments.length === 0)
		return undefined;

	const relaxedTypeArguments = typeArguments.map(typeArgument => relaxType(typeArgument, checker));
	const typeWithArguments = type as TypeWithAliasArguments;

	return {
		...type,
		aliasTypeArguments:    typeWithArguments.aliasTypeArguments == null ? undefined : relaxedTypeArguments,
		resolvedTypeArguments: relaxedTypeArguments,
	} as Type;
}

/**
 * Relax the type so that for example "string literal" become "string" and "function" become "any"
 * This is used for javascript files to provide type checking with Typescript type inferring
 * @param type
 */
export function relaxType(type: Type, checker: TypeChecker): Type {
	if (type.isUnion())
		return getUnionType(checker, type.types.map(member => relaxType(member, checker)));

	if (type.isIntersection())
		return { ...type, types: type.types.map(member => relaxType(member, checker)) } as Type;

	if ((type.flags & TypeFlags.Literal) !== 0)
		return checker.getBaseTypeOfLiteralType(type);

	if ((type.flags & (TypeFlags.Null | TypeFlags.Undefined)) !== 0)
		return checker.getAnyType();

	if ((type.flags & TypeFlags.Object) !== 0
		&& ((type as TypeReference).objectFlags & (ObjectFlags.Interface | ObjectFlags.Class)) !== 0)
		return checker.getAnyType();

	if (isTypeReference(type) || (type as TypeWithAliasArguments).aliasTypeArguments != null) {
		const relaxedType = relaxTypeArguments(type, checker);
		if (relaxedType != null)
			return relaxedType;
	}

	if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0)
		return checker.getAnyType();

	return type;
}
