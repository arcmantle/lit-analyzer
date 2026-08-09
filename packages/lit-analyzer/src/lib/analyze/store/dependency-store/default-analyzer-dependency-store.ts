import { SourceFile } from 'typescript';
import { ComponentDefinition } from '@arcmantle/web-component-analyzer';

import { AnalyzerDependencyStore } from '../analyzer-dependency-store.js';

export class DefaultAnalyzerDependencyStore implements AnalyzerDependencyStore {

	private importedComponentDefinitionsInFile: Map<string, ComponentDefinition[]> = new Map();

	absorbComponentDefinitionsForFile(sourceFile: SourceFile, result: ComponentDefinition[]): void {
		this.importedComponentDefinitionsInFile.set(sourceFile.fileName, result);
	}

	/**
	 * Returns if a component for a specific file has been imported.
	 * @param fileName
	 * @param tagName
	 */
	hasTagNameBeenImported(fileName: string, tagName: string): boolean {
		for (const file of this.importedComponentDefinitionsInFile.get(fileName) || []) {
			if (file.tagName === tagName)
				return true;
		}

		return false;
	}

}
