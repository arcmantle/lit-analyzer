import { SourceFile } from 'typescript';
import { AnalyzerResult, ComponentDeclaration, ComponentDefinition } from 'web-component-analyzer';

import { getContributingFiles, getDeclarationsInFile } from '../../util/component-util.js';
import { AnalyzerDefinitionStore } from '../analyzer-definition-store.js';

export class DefaultAnalyzerDefinitionStore implements AnalyzerDefinitionStore {

	private analysisResultForFile: Map<string, AnalyzerResult> = new Map();
	private definitionForTagName:  Map<string, ComponentDefinition> = new Map();

	private intersectingDefinitionsForFile: Map<string, Set<ComponentDefinition>> = new Map();

	absorbAnalysisResult(sourceFile: SourceFile, result: AnalyzerResult): void {
		this.analysisResultForFile.set(sourceFile.fileName, result);

		result.componentDefinitions.forEach(definition => {
			this.definitionForTagName.set(definition.tagName, definition);

			for (const contributingFile of getContributingFiles(definition))
				addToSetInMap(this.intersectingDefinitionsForFile, contributingFile.fileName, definition);
		});
	}

	forgetAnalysisResultForFile(sourceFile: SourceFile): void {
		const result = this.analysisResultForFile.get(sourceFile.fileName);
		if (result == null)
			return;

		result.componentDefinitions.forEach(definition => {
			this.definitionForTagName.delete(definition.tagName);

			for (const contributingFile of getContributingFiles(definition))
				this.intersectingDefinitionsForFile.get(contributingFile.fileName)?.delete(definition);
		});

		this.analysisResultForFile.delete(sourceFile.fileName);
	}

	getAnalysisResultForFile(sourceFile: SourceFile): AnalyzerResult | undefined {
		return this.analysisResultForFile.get(sourceFile.fileName);
	}

	getDefinitionsWithDeclarationInFile(sourceFile: SourceFile): ComponentDefinition[] {
		return Array.from(this.intersectingDefinitionsForFile.get(sourceFile.fileName) || []);
	}

	getComponentDeclarationsInFile(sourceFile: SourceFile): ComponentDeclaration[] {
		const declarations: Set<ComponentDeclaration> = new Set();

		for (const definition of this.intersectingDefinitionsForFile.get(sourceFile.fileName) || []) {
			for (const declaration of getDeclarationsInFile(definition, sourceFile))
				declarations.add(declaration);
		}

		return Array.from(declarations);
	}

	getDefinitionForTagName(tagName: string): ComponentDefinition | undefined {
		return this.definitionForTagName.get(tagName);
	}

	getDefinitionsInFile(sourceFile: SourceFile): ComponentDefinition[] {
		const result = this.analysisResultForFile.get(sourceFile.fileName);

		return (result != null && result.componentDefinitions) || [];
	}

}

function addToSetInMap<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	const set = map.get(key) || new Set();
	set.add(value);
	map.set(key, set);
}
