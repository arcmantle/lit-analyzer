import { hasFlag as hasTypeFlag } from '@arcmantle/web-component-analyzer';
import { Type, TypeChecker, TypeFlags, UnionType } from 'typescript';

export { hasFlag } from '@arcmantle/web-component-analyzer';

export function isAnyOrUnknown(type: Type): boolean {
	return (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0;
}

export function isNullOrUndefined(type: Type): boolean {
	return hasTypeFlag(type, TypeFlags.Null) || hasTypeFlag(type, TypeFlags.Undefined);
}

// A union is primitive only when every member is primitive.
export function isPrimitiveType(type: Type): boolean {
	if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.TypeParameter)) !== 0)
		return true;

	if (isUnionType(type))
		return type.types.every(member => isPrimitiveType(member));

	if (type.isIntersection())
		return type.types.every(member => isPrimitiveType(member));

	return (type.flags & (
		TypeFlags.StringLike
		| TypeFlags.NumberLike
		| TypeFlags.BigIntLike
		| TypeFlags.BooleanLike
		| TypeFlags.EnumLike
		| TypeFlags.ESSymbolLike
		| TypeFlags.Null
		| TypeFlags.Undefined
	)) !== 0;
}


// A union is boolean when any member is boolean; intersections require every member.
export function isBooleanType(type: Type, checker: TypeChecker, { matchAny = false }: { matchAny?: boolean; } = {}): boolean {
	if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0)
		return matchAny;

	if (isUnionType(type))
		return type.types.some(member => isBooleanType(member, checker, { matchAny }));

	if (type.isIntersection())
		return type.types.every(member => isBooleanType(member, checker, { matchAny }));

	if ((type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.Never)) !== 0)
		return false;

	return (type.flags & TypeFlags.BooleanLike) !== 0
		|| checker.isTypeAssignableTo(type, checker.getBooleanType());
}

export function typeToDisplayString(type: Type, checker: TypeChecker): string {
	return checker.typeToString(type);
}

export function isUnionType(type: Type): type is UnionType {
	return type.isUnion();
}
