import type tsModule from 'typescript';
import { CompilerHost, CompilerOptions, createProgram, createSourceFile, Diagnostic, JSDocTag, LanguageServiceHost, Node, Program, ScriptKind, ScriptSnapshot, ScriptTarget, SourceFile, SymbolFlags } from 'typescript';

import { getJsDoc, normalizeJsDocTypeExpression, splitTopLevel } from './js-doc-util.js';
import { createVirtualCompilerHost, VirtualCompilerFile } from './virtual-compiler-host.js';

export interface RecoveredJSDocType {
	ownerFileName: string;
	commentStart:  number;
	tagIndex:      number;
	type:          string;
	aliasName:     string;
}

export function scanRecoveredJSDocTypes(sourceFile: SourceFile, ts: typeof tsModule): RecoveredJSDocType[] {
	const recovered: RecoveredJSDocType[] = [];
	const seen: Set<string> = new Set();

	const visit = (node: import('typescript').Node): void => {
		const leadingComment = ts.getLeadingCommentRanges(sourceFile.text, node.pos)?.[0];
		const jsDoc = getJsDoc(node, ts);
		if (leadingComment != null && jsDoc?.tags != null) {
			jsDoc.tags.forEach((tag, tagIndex) => {
				const parsed = tag.parsed();
				if (parsed.type == null || hasUsableCompilerTypeExpression(tag.node, ts))
					return;

				const key = `${ leadingComment.pos }:${ tagIndex }`;
				if (seen.has(key))
					return;

				seen.add(key);
				recovered.push({
					ownerFileName: sourceFile.fileName,
					commentStart:  leadingComment.pos,
					tagIndex,
					type:          parsed.type,
					aliasName:     getJSDocAliasName(leadingComment.pos, tagIndex),
				});
			});
		}

		node.forEachChild(visit);
	};

	sourceFile.forEachChild(visit);

	return recovered;
}

export function createJSDocVirtualFile(
	sourceFile: SourceFile,
	recoveredTypes: readonly RecoveredJSDocType[],
	ts: typeof tsModule,
	isResolvableIdentifier?: (identifier: string) => boolean,
): VirtualCompilerFile | undefined {
	if (recoveredTypes.length === 0)
		return undefined;

	const imports = sourceFile.statements
		.filter(statement => ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement))
		.map(statement => statement.getText(sourceFile))
		.join('\n');
	const aliases = recoveredTypes
		.map(type => `type ${ type.aliasName } = ${ normalizeJsDocTypeExpression(type.type, { ts, isResolvableIdentifier }) };`)
		.join('\n');

	return {
		fileName: `${ sourceFile.fileName }.__lit_jsdoc__.d.ts`,
		text:     [ 'export {};', imports, aliases ].filter(Boolean).join('\n'),
	};
}

export function createJSDocProgram(
	rootNames: readonly string[],
	options: CompilerOptions,
	host: CompilerHost,
	ts: typeof tsModule,
	oldProgram?: Program,
): Program {
	const sourceFiles = rootNames
		.map(fileName => {
			const text = host.readFile(fileName);
			if (text == null)
				return undefined;

			return createSourceFile(
				fileName,
				text,
				options.target ?? ScriptTarget.Latest,
				true,
				fileName.endsWith('.js') ? ScriptKind.JS : ScriptKind.TS,
			);
		})
		.filter((file): file is SourceFile => file != null);
	const recoveredByFile = sourceFiles.map(sourceFile => ({
		sourceFile,
		types: scanRecoveredJSDocTypes(sourceFile, ts),
	}));
	const hasAmbiguousUnion = recoveredByFile.some(({ types }) =>
		types.some(type => getBareUnionIdentifiers(type.type).length > 0));
	const classificationProgram = hasAmbiguousUnion
		? createProgram({ rootNames, options, host, oldProgram })
		: undefined;
	const virtualFiles = recoveredByFile
		.map(({ sourceFile, types }) => {
			if (types.length === 0)
				return undefined;
			if (host.fileExists(`${ sourceFile.fileName }.__lit_jsdoc__.d.ts`))
				return undefined;

			const checker = classificationProgram?.getTypeChecker();
			const programSourceFile = classificationProgram?.getSourceFile(sourceFile.fileName);
			const symbols = checker == null || programSourceFile == null
				? undefined
				: checker.getSymbolsInScope(programSourceFile, SymbolFlags.Type);
			const importedNames = getImportedNames(sourceFile, ts);
			const isResolvableIdentifier = classificationProgram == null
				? undefined
				: (identifier: string) =>
					isJSDocKeyword(identifier)
					|| importedNames.has(identifier)
					|| symbols?.some(symbol => symbol.name === identifier) === true;

			return createJSDocVirtualFile(sourceFile, types, ts, isResolvableIdentifier);
		})
		.filter((file): file is VirtualCompilerFile => file != null);

	if (virtualFiles.length === 0)
		return classificationProgram ?? createProgram({ rootNames, options, host, oldProgram });

	const virtualHost = createVirtualCompilerHost(host, rootNames, virtualFiles);

	return createProgram({
		rootNames:  virtualHost.rootNames,
		options,
		host:       virtualHost.host,
		oldProgram: classificationProgram ?? oldProgram,
	});
}

export interface JSDocLanguageServiceHost {
	host: LanguageServiceHost;
	update(program: Program): boolean;
}

export function createJSDocLanguageServiceHost(host: LanguageServiceHost, ts: typeof tsModule): JSDocLanguageServiceHost {
	let virtualFiles: VirtualCompilerFile[] = [];

	const augmentedHost: LanguageServiceHost = {
		...host,
		getScriptFileNames(): string[] {
			return [ ...host.getScriptFileNames(), ...virtualFiles.map(file => file.fileName) ];
		},
		getScriptVersion(fileName: string): string {
			const virtualFile = virtualFiles.find(file => file.fileName === fileName);

			return virtualFile?.version ?? virtualFile?.text ?? host.getScriptVersion(fileName);
		},
		getScriptSnapshot(fileName: string) {
			const virtualFile = virtualFiles.find(file => file.fileName === fileName);

			return virtualFile == null
				? host.getScriptSnapshot(fileName)
				: ScriptSnapshot.fromString(virtualFile.text);
		},
		fileExists(fileName: string): boolean {
			return virtualFiles.some(file => file.fileName === fileName) || (host.fileExists?.(fileName) ?? false);
		},
		readFile(fileName: string, encoding?: string): string | undefined {
			return virtualFiles.find(file => file.fileName === fileName)?.text ?? host.readFile?.(fileName, encoding);
		},
	};

	return {
		host: augmentedHost,
		update(program: Program): boolean {
			const checker = program.getTypeChecker();
			const nextVirtualFiles = host.getScriptFileNames()
				.map(fileName => {
					const snapshot = host.getScriptSnapshot(fileName);
					if (snapshot == null)
						return undefined;

					const sourceFile = createSourceFile(
						fileName,
						snapshot.getText(0, snapshot.getLength()),
						program.getCompilerOptions().target ?? ScriptTarget.Latest,
						true,
						fileName.endsWith('.js') ? ScriptKind.JS : ScriptKind.TS,
					);
					const recoveredTypes = scanRecoveredJSDocTypes(sourceFile, ts);
					if (recoveredTypes.length === 0 || host.fileExists?.(`${ fileName }.__lit_jsdoc__.d.ts`))
						return undefined;

					const programSourceFile = program.getSourceFile(fileName);
					const symbols = programSourceFile == null ? [] : checker.getSymbolsInScope(programSourceFile, SymbolFlags.Type);
					const importedNames = getImportedNames(sourceFile, ts);
					const isResolvableIdentifier = (identifier: string) =>
						isJSDocKeyword(identifier)
						|| importedNames.has(identifier)
						|| symbols.some(symbol => symbol.name === identifier);

					return createJSDocVirtualFile(sourceFile, recoveredTypes, ts, isResolvableIdentifier);
				})
				.filter((file): file is VirtualCompilerFile => file != null);

			const changed
				 = nextVirtualFiles.length !== virtualFiles.length
				|| nextVirtualFiles.some(
					(file, index) => virtualFiles[index]?.fileName !== file.fileName
						|| virtualFiles[index]?.text !== file.text,
				);
			virtualFiles = nextVirtualFiles;

			return changed;
		},
	};
}

export function hasJSDocResolverDiagnostic(program: Program, sourceFile: SourceFile, node: Node): boolean {
	const diagnostics: readonly Diagnostic[] = [
		...program.getSyntacticDiagnostics(sourceFile),
		...program.getSemanticDiagnostics(sourceFile),
	];
	const nodeStart = node.getStart(sourceFile);
	const nodeEnd = node.getEnd();

	return diagnostics.some(diagnostic => {
		if (diagnostic.start == null || diagnostic.length == null)
			return false;

		const diagnosticEnd = diagnostic.start + diagnostic.length;

		return diagnostic.start < nodeEnd && diagnosticEnd > nodeStart;
	});
}

export function getJSDocAliasName(commentStart: number, tagIndex: number): string {
	return `__lit_jsdoc_${ commentStart }_${ tagIndex }`;
}

function hasUsableCompilerTypeExpression(tag: JSDocTag | undefined, ts: typeof tsModule): boolean {
	if (tag == null || !('typeExpression' in tag))
		return false;

	return !ts.isTypeLiteralNode((tag as import('typescript').JSDocTypeTag).typeExpression.type);
}

function getBareUnionIdentifiers(expression: string): string[] {
	return splitTopLevel(expression, '|')
		.filter(part => /^[A-Za-z_$][\w$-]*$/.test(part.trim()))
		.map(part => part.trim());
}

function isJSDocKeyword(identifier: string): boolean {
	return [
		'any',
		'bigint',
		'boolean',
		'false',
		'never',
		'null',
		'number',
		'object',
		'string',
		'symbol',
		'true',
		'undefined',
		'unknown',
		'void',
	].includes(identifier.toLowerCase());
}

function getImportedNames(sourceFile: SourceFile, ts: typeof tsModule): Set<string> {
	const names: Set<string> = new Set();
	for (const statement of sourceFile.statements) {
		if (ts.isImportEqualsDeclaration(statement)) {
			names.add(statement.name.text);
			continue;
		}

		if (!ts.isImportDeclaration(statement) || statement.importClause == null)
			continue;

		const clause = statement.importClause;
		if (clause.name != null)
			names.add(clause.name.text);

		if (clause.namedBindings == null)
			continue;
		if (ts.isNamespaceImport(clause.namedBindings)) { names.add(clause.namedBindings.name.text); }
		else {
			for (const element of clause.namedBindings.elements)
				names.add(element.name.text);
		}
	}

	return names;
}
