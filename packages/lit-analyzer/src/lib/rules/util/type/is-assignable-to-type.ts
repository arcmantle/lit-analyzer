import { Type, TypeChecker, TypeFlags } from 'typescript';

import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { isUnionType } from './type-utils.js';

const typeScriptAssignabilityCache: WeakMap<Type, WeakMap<Type, boolean>> = new WeakMap();
const javaScriptAssignabilityCache: WeakMap<Type, WeakMap<Type, boolean>> = new WeakMap();

export function isAssignableToType(
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean {
	const checker = context.program.getTypeChecker();
	if (hasFreeTypeParameter(typeA))
		return true;

	const cache = context.file.fileName.endsWith('.js')
		? javaScriptAssignabilityCache
		: typeScriptAssignabilityCache;
	const cachedBySource = cache.get(typeA);
	if (cachedBySource?.has(typeB))
		return cachedBySource.get(typeB)!;

	const result = context.file.fileName.endsWith('.js')
		? isAssignableInJavaScriptFile(typeA, typeB, checker)
		: checker.isTypeAssignableTo(typeB, typeA);
	const nextCachedBySource = cachedBySource ?? new WeakMap<Type, boolean>();
	nextCachedBySource.set(typeB, result);
	cache.set(typeA, nextCachedBySource);

	return result;
}

function isAssignableInJavaScriptFile(
	typeA: Type,
	typeB: Type,
	checker: TypeChecker,
): boolean {
	if (isUnionType(typeB))
		return typeB.types.every(member => isAssignableInJavaScriptFile(typeA, member, checker));

	if ((typeB.flags & (TypeFlags.Null | TypeFlags.Undefined)) !== 0)
		return (typeA.flags & TypeFlags.Never) === 0;

	return checker.isTypeAssignableTo(typeB, typeA);
}

function hasFreeTypeParameter(type: Type): boolean {
	if ((type.flags & TypeFlags.TypeParameter) !== 0)
		return true;

	if (isUnionType(type))
		return type.types.some(hasFreeTypeParameter);

	return type.isIntersection() && type.types.some(hasFreeTypeParameter);
}
