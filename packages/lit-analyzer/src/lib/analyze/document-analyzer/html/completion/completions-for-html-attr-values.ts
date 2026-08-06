import { isTypeAliasDeclaration, ObjectFlags, Type, TypeChecker, TypeFlags, TypeReference } from 'typescript';

import { LitAnalyzerContext } from '../../../lit-analyzer-context.js';
import { HtmlNodeAttrAssignmentKind } from '../../../types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttr, HtmlNodeAttrKind } from '../../../types/html-node/html-node-attr-types.js';
import { LitCompletion } from '../../../types/lit-completion.js';
import { DocumentPositionContext } from '../../../util/get-position-context-in-document.js';

export function completionsForHtmlAttrValues(
	htmlNodeAttr: HtmlNodeAttr,
	location: DocumentPositionContext,
	{ htmlStore, program }: LitAnalyzerContext,
): LitCompletion[] {
	// There is not point in showing completions for event listener bindings
	if (htmlNodeAttr.kind === HtmlNodeAttrKind.EVENT_LISTENER)
		return [];

	// Don't show completions inside assignments with expressions
	if (htmlNodeAttr.assignment && htmlNodeAttr.assignment.kind === HtmlNodeAttrAssignmentKind.EXPRESSION)
		return [];

	const htmlTagMember = htmlStore.getHtmlAttrTarget(htmlNodeAttr);
	if (htmlTagMember == null)
		return [];

	// Special case for handling slot attr as we need to look at its parent
	if (htmlNodeAttr.name === 'slot') {
		const parentHtmlTag = htmlNodeAttr.htmlNode.parent && htmlStore.getHtmlTag(htmlNodeAttr.htmlNode.parent);
		if (parentHtmlTag != null && parentHtmlTag.slots.length > 0) {
			return parentHtmlTag.slots.map(
				slot =>
					({
						name:          slot.name || ' ',
						insert:        slot.name || '',
						documentation: () => slot.description,
						kind:          'enumElement',
					} as LitCompletion),
			);
		}
	}

	const options = getOptionsFromType(htmlTagMember.getType(program.getTypeChecker()), program.getTypeChecker());

	return options.map(
		option =>
			({
				name:   option,
				insert: option,
				kind:   'enumElement',
			} as LitCompletion),
	);
}


function getOptionsFromType(type: Type, checker: TypeChecker, skipAlias = false): string[] {
	if (!skipAlias && type.aliasSymbol != null) {
		const aliasDeclaration = type.aliasSymbol.declarations?.find(isTypeAliasDeclaration);
		if (aliasDeclaration != null)
			return getOptionsFromType(checker.getTypeAtLocation(aliasDeclaration.type), checker, true);
	}

	if (type.isUnion()) {
		return type.types
			.filter(member => member.isStringLiteral())
			.map(member => member.value.toString());
	}

	const typeArguments = getTypeArguments(type);
	if (typeArguments.length > 0)
		return getOptionsFromType(typeArguments[0], checker);

	return [];
}

function getTypeArguments(type: Type): readonly Type[] {
	if ((type.flags & TypeFlags.Object) === 0 || ((type as TypeReference).objectFlags & ObjectFlags.Reference) === 0)
		return [];

	const typeReference = type as TypeReference;
	if (typeReference.target === typeReference)
		return [];

	return typeReference.typeArguments || [];
}
