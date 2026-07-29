import { SourceFile } from "typescript";
import { ComponentDeclaration, ComponentFeatures } from "./component-declaration.js";
import { ComponentDefinition } from "./component-definition.js";

/**
 * The result returned after components have been analyzed.
 */
export interface AnalyzerResult {
	sourceFile: SourceFile;
	componentDefinitions: ComponentDefinition[];
	declarations?: ComponentDeclaration[];
	globalFeatures?: ComponentFeatures;
}
