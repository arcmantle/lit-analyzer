import { SignatureKind, Type, TypeChecker, TypeFlags } from 'typescript';
import { isTypeReference } from '@arcmantle/web-component-analyzer';

const partTypeNames: ReadonlySet<string> = new Set([
	'Part',
	'NodePart',
	'AttributePart',
	'BooleanAttributePart',
	'PropertyPart',
	'EventPart',
]);

export function isLitDirectiveType(type: Type, checker: TypeChecker): boolean {
	if (type.isUnion())
		return type.types.some(member => isLitDirectiveType(member, checker));

	return isLit1DirectiveTypeInternal(type, checker) || isLit2DirectiveType(type);
}

export function isLit2DirectiveType(type: Type): boolean {
	if (getTypeName(type) === 'DirectiveResult')
		return true;

	if (isTypeReference(type))
		return getTypeName(type.target) === 'DirectiveResult';

	return false;
}

export function getLitDirectiveTypeArgument(type: Type, checker: TypeChecker): Type | undefined {
	if (getTypeName(type) !== 'DirectiveFn' && !isLit1DirectiveTypeInternal(type, checker))
		return undefined;

	return getTypeArguments(type, checker)[0];
}

export function isLit1DirectiveTypeInternal(type: Type, checker: TypeChecker): boolean {
	const typeName = getTypeName(type);
	if (typeName === 'DirectiveFn' || typeName === 'Directive')
		return true;

	return checker.getSignaturesOfType(type, SignatureKind.Call).some(signature => {
		if ((signature.getReturnType().flags & TypeFlags.Void) === 0 || signature.parameters.length === 0)
			return false;

		return isPartType(checker.getTypeOfSymbol(signature.parameters[0]));
	});
}

function isPartType(type: Type): boolean {
	if (type.isUnion())
		return type.types.every(isPartType);

	return partTypeNames.has(getTypeName(type) || '');
}

function getTypeName(type: Type): string | undefined {
	return type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
}

function getTypeArguments(type: Type, checker: TypeChecker): readonly Type[] {
	if (type.aliasTypeArguments != null)
		return type.aliasTypeArguments;

	if (isTypeReference(type))
		return checker.getTypeArguments(type);

	return [];
}
