import { Node } from 'typescript';

import { AnalyzerVisitContext } from '../../analyzer-visit-context.js';
import { DefinitionNodeResult } from '../analyzer-flavor.js';
import { getLwcComponent } from './utils.js';

export function discoverDefinitions(node: Node, context: AnalyzerVisitContext): DefinitionNodeResult[] | undefined {
	const { ts } = context;
	if (ts.isClassDeclaration(node)) {
		const lwc = getLwcComponent(node, context);
		if (lwc) {
			return [
				{
					tagName:         lwc.tagName,
					tagNameNode:     node.heritageClauses?.[0].types[0],
					declarationNode: node,
				},
			];
		}
	}

	return undefined;
}
