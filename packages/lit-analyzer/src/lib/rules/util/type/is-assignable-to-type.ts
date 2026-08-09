import { Type, TypeChecker, TypeFlags } from 'typescript';

import { RuleModuleContext } from '../../../analyze/types/rule/rule-module-context.js';
import { isUnionType } from './type-utils.js';


export function isAssignableToType(
	{ typeA, typeB }: { typeA: Type; typeB: Type; },
	context: RuleModuleContext,
): boolean {
	const checker = context.program.getTypeChecker();
	if (hasFreeTypeParameter(typeA))
		return true;

	if (context.file.fileName.endsWith('.js'))
		return isAssignableInJavaScriptFile(typeA, typeB, checker);

	return checker.isTypeAssignableTo(typeB, typeA);
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
