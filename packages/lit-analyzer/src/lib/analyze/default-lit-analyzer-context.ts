import * as tsMod from 'typescript';
import { HostCancellationToken, Program, SourceFile, TypeChecker } from 'typescript';
import * as tsServer from 'typescript/lib/tsserverlibrary.js';
import { analyzeHTMLElement, analyzeSourceFile } from '@arcmantle/web-component-analyzer';

import { ALL_RULES } from '../rules/all-rules.js';
import { MAX_RUNNING_TIME_PER_OPERATION } from './constants.js';
import { getBuiltInHtmlCollection } from './data/get-built-in-html-collection.js';
import { getUserConfigHtmlCollection } from './data/get-user-config-html-collection.js';
import { isRuleDisabled, LitAnalyzerConfig, makeConfig } from './lit-analyzer-config.js';
import { LitAnalyzerContext, LitAnalyzerContextBaseOptions, LitPluginContextHandler } from './lit-analyzer-context.js';
import { DefaultLitAnalyzerLogger, LitAnalyzerLoggerLevel } from './lit-analyzer-logger.js';
import {
	convertAnalyzeResultToHtmlCollection,
	convertComponentDeclarationToHtmlTag,
} from './parse/convert-component-definitions-to-html-collection.js';
import { parseDependencies } from './parse/parse-dependencies/parse-dependencies.js';
import { RuleCollection } from './rule-collection.js';
import { DefaultAnalyzerDefinitionStore } from './store/definition-store/default-analyzer-definition-store.js';
import { DefaultAnalyzerDependencyStore } from './store/dependency-store/default-analyzer-dependency-store.js';
import { DefaultAnalyzerDocumentStore } from './store/document-store/default-analyzer-document-store.js';
import { DefaultAnalyzerHtmlStore } from './store/html-store/default-analyzer-html-store.js';
import { HtmlDataSourceKind } from './store/html-store/html-data-source-merged.js';
import { changedSourceFileIterator } from './util/changed-source-file-iterator.js';
import { getContributingFiles } from './util/component-util.js';

// An id, rather than the program itself, so that recording which program
// analyzed a file cannot keep that program alive.
const PROGRAM_IDS: WeakMap<Program, number> = new WeakMap();
let nextProgramId = 0;

function programIdOf(program: Program): number {
	const id = PROGRAM_IDS.get(program) ?? nextProgramId++;
	PROGRAM_IDS.set(program, id);

	return id;
}

export class DefaultLitAnalyzerContext implements LitAnalyzerContext {

	protected componentSourceFileIterator = changedSourceFileIterator();
	protected hasAnalyzedSubclassExtensions = false;
	protected componentProgramId: number | undefined;
	private refreshingTags:       Set<string> = new Set();
	protected _config:            LitAnalyzerConfig = makeConfig({});

	get ts(): typeof tsMod {
		return this.handler.ts || tsMod;
	}

	get program(): Program {
		return this.handler.getProgram();
	}

	get project(): tsServer.server.Project | undefined {
		return this.handler.getProject != null ? this.handler.getProject() : undefined;
	}

	get config(): LitAnalyzerConfig {
		return this._config;
	}

	private _currentStartTime = Date.now();
	private _currentTimeout = MAX_RUNNING_TIME_PER_OPERATION;
	get currentRunningTime(): number {
		return Date.now() - this._currentStartTime;
	}

	private _currentCancellationToken: HostCancellationToken | undefined = undefined;
	private _hasRequestedCancellation = false;
	private _throwOnRequestedCancellation = false;
	get isCancellationRequested(): boolean {
		if (this._hasRequestedCancellation)
			return true;


		if (this._currentCancellationToken == null) {
			// Never cancel if "cancellation token" is not present
			// This means that we are in a CLI context, and are willing to wait for the operation to finish for correctness reasons
			return false;
		}

		if (this._currentCancellationToken?.isCancellationRequested()) {
			if (!this._hasRequestedCancellation)
				this.logger.error('Cancelling current operation because project host has requested cancellation');


			this._hasRequestedCancellation = true;
		}

		if (this.currentRunningTime > this._currentTimeout) {
			if (!this._hasRequestedCancellation) {
				this.logger.error(
					`Cancelling current operation because it has been running for `
					+ `more than ${ this._currentTimeout }ms (${ this.currentRunningTime }ms)`,
				);
			}

			this._hasRequestedCancellation = true;
		}

		// Throw if necessary
		if (this._hasRequestedCancellation && this._throwOnRequestedCancellation)
			throw new this.ts.OperationCanceledException();


		return this._hasRequestedCancellation;
	}

	private _currentFile: SourceFile | undefined;
	get currentFile(): SourceFile {
		if (this._currentFile == null)
			throw new Error('Current file is not set');


		return this._currentFile;
	}

	readonly htmlStore = new DefaultAnalyzerHtmlStore();
	readonly dependencyStore = new DefaultAnalyzerDependencyStore();
	readonly documentStore = new DefaultAnalyzerDocumentStore();
	readonly definitionStore = new DefaultAnalyzerDefinitionStore();
	readonly logger = new DefaultLitAnalyzerLogger();

	private _rules: RuleCollection | undefined;
	get rules(): RuleCollection {
		if (this._rules == null) {
			this._rules = new RuleCollection();
			this._rules.push(...ALL_RULES);
		}

		return this._rules;
	}

	setContextBase({ file, timeout, throwOnCancellation }: LitAnalyzerContextBaseOptions): void {
		this._currentFile = file;
		this._currentStartTime = Date.now();
		this._currentTimeout = timeout ?? MAX_RUNNING_TIME_PER_OPERATION;
		this._currentCancellationToken = this.handler.getCancellationToken?.() ?? this.project?.getCancellationToken();
		this._throwOnRequestedCancellation = throwOnCancellation ?? false;
		this._hasRequestedCancellation = false;
	}

	updateConfig(config: LitAnalyzerConfig): void {
		this._config = config;

		this.logger.level = (() => {
			switch (config.logging) {
			case 'off':
				return LitAnalyzerLoggerLevel.OFF;
			case 'error':
				return LitAnalyzerLoggerLevel.ERROR;
			case 'warn':
				return LitAnalyzerLoggerLevel.WARN;
			case 'debug':
				return LitAnalyzerLoggerLevel.DEBUG;
			case 'verbose':
				return LitAnalyzerLoggerLevel.VERBOSE;
			default:
				return LitAnalyzerLoggerLevel.OFF;
			}
		})();

		// Add user configured HTML5 collection
		const collection = getUserConfigHtmlCollection(config, this.checker);
		this.htmlStore.absorbCollection(collection, HtmlDataSourceKind.USER);
	}

	updateDependencies(file: SourceFile): void {
		this.findDependenciesInFile(file);
	}

	updateComponents(file: SourceFile): void {
		this.forgetSubclassExtensionsBuiltWithAnotherProgram();
		this.findInvalidatedComponents();
		this.analyzeSubclassExtensions();
	}

	/**
	 * A component keeps the types the checker of its own program gave it, so a
	 * component built with an earlier program keeps that whole program alive. The
	 * components themselves are rebuilt on demand, in `refreshTagBuiltWithAnotherProgram`.
	 */
	private forgetSubclassExtensionsBuiltWithAnotherProgram(): void {
		const programId = programIdOf(this.program);
		if (this.componentProgramId === programId)
			return;


		const previousProgramId = this.componentProgramId;
		this.componentProgramId = programId;
		if (previousProgramId != null)
			this.hasAnalyzedSubclassExtensions = false;
	}

	/**
	 * Rebuilds the component behind `tagName` when one of its contributing files is no longer the
	 * source file the current program owns, which means its nodes are dead. Called before every
	 * read of a tag, so only the tags a file uses are rebuilt, not every component in the project.
	 */
	private refreshTagBuiltWithAnotherProgram(tagName: string): void {
		if (this.refreshingTags.has(tagName))
			return;


		const definition = this.definitionStore.getDefinitionForTagName(tagName);
		if (definition == null)
			return;


		const staleFile = Array.from(getContributingFiles(definition))
			.find(file => this.program.getSourceFile(file.fileName) !== file);

		if (staleFile == null)
			return;


		const fileName = definition.sourceFile.fileName;
		const sourceFile = this.program.getSourceFile(fileName);

		this.refreshingTags.add(tagName);
		try {
			if (sourceFile == null) {
				this.logger.debug(`Forgetting <${ tagName }>: ${ fileName } left the program`);
				// A default library file never leaves the program, so the kind can only be DECLARED here.
				this.forgetComponentsInFile(definition.sourceFile, HtmlDataSourceKind.DECLARED);

				return;
			}

			this.logger.debug(`Rebuilding <${ tagName }> in ${ fileName }: ${ staleFile.fileName } is no longer current`);
			this.componentSourceFileIterator.invalidate(sourceFile);
			this.findComponentsInFile(sourceFile);
		}
		finally {
			this.refreshingTags.delete(tagName);
		}
	}

	private get checker(): TypeChecker {
		return this.program.getTypeChecker();
	}

	constructor(private handler: LitPluginContextHandler) {
		// Add all HTML5 tags and attributes
		const builtInCollection = getBuiltInHtmlCollection();
		this.htmlStore.absorbCollection(builtInCollection, HtmlDataSourceKind.BUILT_IN);
		this.htmlStore.beforeTagRead = tagName => this.refreshTagBuiltWithAnotherProgram(tagName);
	}

	private findInvalidatedComponents() {
		const startTime = Date.now();

		const seenFiles: Set<SourceFile> = new Set();
		const invalidatedFiles: Set<SourceFile> = new Set();

		const getRunningTime = () => {
			return Date.now() - startTime;
		};

		// Find components in all changed files
		for (const sourceFile of this.componentSourceFileIterator(this.program.getSourceFiles())) {
			if (this.isCancellationRequested)
				break;

			seenFiles.add(sourceFile);

			// All components definitions that use this file must be invalidated
			this.definitionStore.getDefinitionsWithDeclarationInFile(sourceFile).forEach(definition => {
				const sf = this.program.getSourceFile(definition.sourceFile.fileName);
				if (sf != null)
					invalidatedFiles.add(sf);
			});

			this.logger.debug(`Analyzing components in ${ sourceFile.fileName } (changed) (${ getRunningTime() }ms total)`);
			this.findComponentsInFile(sourceFile);
		}

		for (const sourceFile of invalidatedFiles) {
			if (this.isCancellationRequested)
				break;


			if (!seenFiles.has(sourceFile)) {
				seenFiles.add(sourceFile);

				this.logger.debug(`Analyzing components in ${ sourceFile.fileName } (invalidated) (${ getRunningTime() }ms total)`);
				this.findComponentsInFile(sourceFile);
			}
		}

		this.logger.verbose(
			`Analyzed ${ seenFiles.size } files (${ invalidatedFiles.size } invalidated) in ${ getRunningTime() }ms`,
		);
	}

	private findComponentsInFile(sourceFile: SourceFile) {
		const isDefaultLibrary = this.program.isSourceFileDefaultLibrary(sourceFile);
		const isExternalLibrary = this.program.isSourceFileFromExternalLibrary(sourceFile);

		// Only analyzing specific default libs of interest can save us up to 500ms in startup time
		if (
			(isDefaultLibrary && sourceFile.fileName.match(/(lib\.dom\.d\.ts)/) == null) ||
			(isExternalLibrary && sourceFile.fileName.match(/(@types\/node)/) != null)
		)
			return;


		const analyzeResult = analyzeSourceFile(sourceFile, {
			program: this.program,
			ts:      this.ts,
			config:  {
				features:                 [ 'event', 'member', 'slot', 'csspart', 'cssproperty' ],
				analyzeGlobalFeatures:    !isDefaultLibrary, // Don't analyze global features in lib.dom.d.ts
				analyzeDefaultLib:        true,
				analyzeDependencies:      true,
				analyzeAllDeclarations:   false,
				excludedDeclarationNames: [ 'HTMLElement' ],
			},
		});

		const reg = isDefaultLibrary ? HtmlDataSourceKind.BUILT_IN_DECLARED : HtmlDataSourceKind.DECLARED;

		this.forgetComponentsInFile(sourceFile, reg);

		// Absorb
		this.definitionStore.absorbAnalysisResult(sourceFile, analyzeResult);
		const htmlCollection = convertAnalyzeResultToHtmlCollection(analyzeResult, {
			addDeclarationPropertiesAsAttributes: this.program.isSourceFileFromExternalLibrary(sourceFile),
		});
		this.htmlStore.absorbCollection(htmlCollection, reg);
	}

	/**
	 * Drops everything an earlier analysis of `sourceFile` put in the stores. The source file may
	 * be one the current program no longer owns, because a file that left the program must be
	 * forgotten and cannot be analyzed again.
	 */
	private forgetComponentsInFile(sourceFile: SourceFile, dataSource: HtmlDataSourceKind) {
		const existingResult = this.definitionStore.getAnalysisResultForFile(sourceFile);
		if (existingResult == null)
			return;


		this.htmlStore.forgetCollection(
			{
				tags:   existingResult.componentDefinitions.map(d => d.tagName),
				global: {
					events:        existingResult.globalFeatures?.events.map(e => e.name),
					slots:         existingResult.globalFeatures?.slots.map(s => s.name || ''),
					cssParts:      existingResult.globalFeatures?.cssParts.map(s => s.name || ''),
					cssProperties: existingResult.globalFeatures?.cssProperties.map(s => s.name || ''),
					attributes:    existingResult.globalFeatures?.members
						.filter(m => m.kind === 'attribute')
						.map(m => m.attrName || ''),
					properties: existingResult.globalFeatures?.members
						.filter(m => m.kind === 'property')
						.map(m => m.propName || ''),
				},
			},
			dataSource,
		);
		this.definitionStore.forgetAnalysisResultForFile(sourceFile);
	}

	private analyzeSubclassExtensions() {
		if (this.hasAnalyzedSubclassExtensions)
			return;

		const result = analyzeHTMLElement(this.program, this.ts);
		if (result != null) {
			const extension = convertComponentDeclarationToHtmlTag(result, undefined, {});
			this.htmlStore.absorbSubclassExtension('HTMLElement', extension);
			this.hasAnalyzedSubclassExtensions = true;
		}
	}

	private findDependenciesInFile(file: SourceFile) {
		if (isRuleDisabled(this.config, 'no-missing-import'))
			return;

		// Build a graph of component dependencies
		const res = parseDependencies(file, this);
		this.dependencyStore.absorbComponentDefinitionsForFile(file, res);
	}

}
