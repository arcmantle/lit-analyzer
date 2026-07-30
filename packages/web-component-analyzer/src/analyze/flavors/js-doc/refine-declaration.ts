import { AnalyzerVisitContext } from '../../analyzer-visit-context.js';
import { ComponentDeclaration } from '../../types/component-declaration.js';

/**
 * Refines a component declaration by using jsdoc tags
 * @param declaration
 * @param context
 */
export function refineDeclaration(declaration: ComponentDeclaration, context: AnalyzerVisitContext): ComponentDeclaration | undefined {
	if (declaration.jsDoc == null || declaration.jsDoc.tags == null)
		return undefined;


	// Applies the "@deprecated" jsdoc tag
	const deprecatedTag = declaration.jsDoc.tags.find(t => t.tag === 'deprecated');
	if (deprecatedTag != null) {
		return {
			...declaration,
			deprecated: deprecatedTag.comment || true,
		};
	}

	return undefined;
}
