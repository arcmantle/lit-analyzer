import * as tsMod from 'typescript';
import { Program, SourceFile, Type } from 'typescript';

import { LitAnalyzerConfig } from '../../lit-analyzer-config.js';
import { LitAnalyzerLogger } from '../../lit-analyzer-logger.js';
import { AnalyzerDefinitionStore } from '../../store/analyzer-definition-store.js';
import { AnalyzerDependencyStore } from '../../store/analyzer-dependency-store.js';
import { AnalyzerDocumentStore } from '../../store/analyzer-document-store.js';
import { AnalyzerHtmlStore } from '../../store/analyzer-html-store.js';
import { HtmlNodeAttrAssignment } from '../html-node/html-node-attr-assignment-types.js';
import { RuleDiagnostic } from './rule-diagnostic.js';

export interface BindingTypes {
	typeA: Type;
	typeB: Type;
}

export interface RuleModuleContext {
	readonly ts:      typeof tsMod;
	readonly program: Program;
	readonly file:    SourceFile;

	readonly htmlStore:       AnalyzerHtmlStore;
	readonly dependencyStore: AnalyzerDependencyStore;
	readonly documentStore:   AnalyzerDocumentStore;
	readonly definitionStore: AnalyzerDefinitionStore;

	readonly logger:       LitAnalyzerLogger;
	readonly config:       LitAnalyzerConfig;
	readonly bindingTypes: Map<HtmlNodeAttrAssignment, BindingTypes>;

	report(diagnostic: RuleDiagnostic): void;
	break(): void;
}
