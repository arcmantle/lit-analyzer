import fs from 'node:fs';

import type tsModule from 'typescript';
import type { ComponentMember } from '@arcmantle/web-component-analyzer';

interface SourcePosition {
	fileName: string;
	pos:      number;
}

interface SourceMapper {
	tryGetSourcePosition(position: SourcePosition): SourcePosition | undefined;
}

type TypeScriptWithInternalSourceMaps = typeof tsModule & {
	getSourceMapper(host: {
		useCaseSensitiveFileNames(): boolean;
		getCurrentDirectory(): string;
		getProgram(): tsModule.Program;
		fileExists(fileName: string): boolean;
		readFile(fileName: string): string | undefined;
		log(message: string): void;
	}): SourceMapper;
	getTokenAtPosition(sourceFile: tsModule.SourceFile, position: number): tsModule.Node;
};

const sourceMapperCache: WeakMap<tsModule.Program, SourceMapper> = new WeakMap();
const parsedSourceFileCache: WeakMap<typeof tsModule, Map<string, tsModule.SourceFile>> = new WeakMap();

export function litAttributeNameFromDeclarationMap(
	member: ComponentMember,
	program: tsModule.Program,
	ts: typeof tsModule,
): string | false | undefined {
	if (member.kind !== 'property')
		return undefined;

	const declarationFile = member.node.getSourceFile();
	if (!declarationFile.isDeclarationFile)
		return undefined;

	try {
		const internalTs = ts as TypeScriptWithInternalSourceMaps;
		const originalPosition = getSourceMapper(program, internalTs).tryGetSourcePosition({
			fileName: declarationFile.fileName,
			pos:      member.node.getStart(declarationFile),
		});
		if (originalPosition == null)
			return undefined;

		const sourceText = fs.readFileSync(originalPosition.fileName, 'utf8');
		const sourceFile = getParsedSourceFile(originalPosition.fileName, sourceText, ts);
		let node = internalTs.getTokenAtPosition(sourceFile, originalPosition.pos);
		while (node.parent != null && !isMatchingProperty(node, member.propName, ts))
			node = node.parent;
		if (!isMatchingProperty(node, member.propName, ts) || !ts.canHaveDecorators(node))
			return undefined;

		for (const decorator of ts.getDecorators(node) ?? []) {
			const expression = decorator.expression;
			if (
				!ts.isCallExpression(expression)
				|| !ts.isIdentifier(expression.expression)
				|| expression.expression.text !== 'property'
			)
				continue;

			const options = expression.arguments[0];
			if (options == null || !ts.isObjectLiteralExpression(options))
				return undefined;

			const attribute = options.properties.find(property =>
				ts.isPropertyAssignment(property)
				&& ((ts.isIdentifier(property.name) && property.name.text === 'attribute')
					|| (ts.isStringLiteral(property.name) && property.name.text === 'attribute')));
			if (attribute == null || !ts.isPropertyAssignment(attribute))
				return undefined;

			if (ts.isStringLiteral(attribute.initializer) || ts.isNoSubstitutionTemplateLiteral(attribute.initializer))
				return attribute.initializer.text;

			if (attribute.initializer.kind === ts.SyntaxKind.FalseKeyword)
				return false;

			return undefined;
		}
	}
	catch {
		return undefined;
	}

	return undefined;
}

function getSourceMapper(program: tsModule.Program, ts: TypeScriptWithInternalSourceMaps): SourceMapper {
	let sourceMapper = sourceMapperCache.get(program);
	if (sourceMapper == null) {
		sourceMapper = ts.getSourceMapper({
			useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
			getCurrentDirectory:       () => program.getCurrentDirectory(),
			getProgram:                () => program,
			fileExists:                ts.sys.fileExists,
			readFile:                  ts.sys.readFile,
			log:                       () => {},
		});
		sourceMapperCache.set(program, sourceMapper);
	}

	return sourceMapper;
}

function getParsedSourceFile(sourceFileName: string, sourceText: string, ts: typeof tsModule): tsModule.SourceFile {
	let sourceFiles = parsedSourceFileCache.get(ts);
	if (sourceFiles == null) {
		sourceFiles = new Map();
		parsedSourceFileCache.set(ts, sourceFiles);
	}

	let sourceFile = sourceFiles.get(sourceFileName);
	if (sourceFile == null) {
		sourceFile = ts.createSourceFile(
			sourceFileName,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			sourceFileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
		sourceFiles.set(sourceFileName, sourceFile);
	}

	return sourceFile;
}

function isMatchingProperty(node: tsModule.Node, propertyName: string, ts: typeof tsModule): boolean {
	return (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))
		&& node.name.getText(node.getSourceFile()) === propertyName;
}
