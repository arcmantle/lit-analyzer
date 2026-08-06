import * as ts from "typescript";

import { createJSDocProgram, createJSDocVirtualFile, hasJSDocResolverDiagnostic, scanRecoveredJSDocTypes } from "../../src/analyze/util/jsdoc-compiler-host.js";
import { createVirtualLanguageServiceHost, createVirtualProgram } from "../../src/analyze/util/virtual-compiler-host.js";
import { tsTest } from "../helpers/ts-test.js";

tsTest("virtual compiler files are part of the active Program", t => {
	const rootFileName = "component.ts";
	const virtualFileName = "component.ts.__lit_jsdoc__.d.ts";
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.Latest,
		strict: true,
	};
	const host = ts.createCompilerHost(options);
	const rootText = "const leaked: __lit_jsdoc_0 = 1;";
	const originalFileExists = host.fileExists;
	const originalReadFile = host.readFile;
	host.fileExists = fileName => fileName === rootFileName || originalFileExists(fileName);
	host.readFile = fileName => fileName === rootFileName ? rootText : originalReadFile(fileName);
	const program = createVirtualProgram(
		[rootFileName],
		options,
		host,
		[
			{
				fileName: virtualFileName,
				text: "export {}; type __lit_jsdoc_0 = \"open\" | \"closed\";",
			},
		],
	);

	const virtualSourceFile = program.getSourceFile(virtualFileName);
	if (virtualSourceFile == null)
		throw new Error("The virtual declaration file was not added to the Program");

	const declaration = virtualSourceFile.statements.find(ts.isTypeAliasDeclaration);
	if (declaration == null)
		throw new Error("The virtual declaration file has no type alias");

	const checker = program.getTypeChecker();
	const type = checker.getTypeFromTypeNode(declaration.type);
	t.true(type.isUnion());
	t.deepEqual(type.types.map(member => checker.typeToString(member)).sort(), [ '"closed"', '"open"' ]);
	t.is(host.readFile(rootFileName), rootText);
	t.true(program.getSemanticDiagnostics(program.getSourceFile(rootFileName)).some(diagnostic =>
		diagnostic.messageText.toString().includes("Cannot find name '__lit_jsdoc_0'")
	));
});

tsTest("virtual language-service files preserve snapshots and versions", t => {
	const sourceSnapshot = ts.ScriptSnapshot.fromString("const value = 1;");
	const host: ts.LanguageServiceHost = {
		getScriptFileNames: () => [ "component.ts" ],
		getScriptVersion: () => "1",
		getScriptSnapshot: () => sourceSnapshot,
		getCurrentDirectory: () => ".",
		getCompilationSettings: () => ({}),
		getDefaultLibFileName: options => ts.getDefaultLibFileName(options),
		readFile: () => undefined,
		fileExists: () => false,
	};
	const virtualHost = createVirtualLanguageServiceHost(host, [
		{ fileName: "component.ts.__lit_jsdoc__.d.ts", text: "export {};", version: "2" },
	]);

	t.deepEqual(virtualHost.getScriptFileNames(), [ "component.ts", "component.ts.__lit_jsdoc__.d.ts" ]);
	t.is(virtualHost.getScriptVersion("component.ts.__lit_jsdoc__.d.ts"), "2");
	t.is(virtualHost.getScriptSnapshot("component.ts.__lit_jsdoc__.d.ts")?.getText(0, 10), "export {};");
	t.is(virtualHost.getScriptSnapshot("component.ts")?.getText(0, 17), "const value = 1;");
});

tsTest("recovered JSDoc produces a deterministic virtual declaration file", t => {
	const sourceFile = ts.createSourceFile(
		"src/component.ts",
		'import type { Detail as EventDetail } from "./events.js";\n/** @fires {CustomEvent<EventDetail>} changed */\nclass Component {}',
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const recoveredTypes = scanRecoveredJSDocTypes(sourceFile, ts);
	const virtualFile = createJSDocVirtualFile(sourceFile, recoveredTypes, ts);

	t.is(recoveredTypes.length, 1);
	t.is(recoveredTypes[0]?.commentStart, sourceFile.text.indexOf("/**"));
	t.is(recoveredTypes[0]?.tagIndex, 0);
	t.is(recoveredTypes[0]?.type, "CustomEvent<EventDetail>");
	t.is(recoveredTypes[0]?.aliasName, `__lit_jsdoc_${ recoveredTypes[0]?.commentStart }_0`);
	t.truthy(virtualFile);
	t.true(virtualFile!.text.startsWith("export {};"));
	t.true(virtualFile!.text.includes('import type { Detail as EventDetail } from "./events.js";'));
	t.true(virtualFile!.text.includes(`type ${ recoveredTypes[0]!.aliasName } = CustomEvent<EventDetail>;`));
});

tsTest("JSDoc program resolves a recovered literal union in the active checker", t => {
	const rootFileName = "component.ts";
	const sourceText = '/** @slot {"div"|"span"} content */\nclass Component {}';
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.Latest,
		strict: true,
	};
	const host = ts.createCompilerHost(options);
	const originalFileExists = host.fileExists;
	const originalReadFile = host.readFile;
	host.fileExists = fileName => fileName === rootFileName || originalFileExists(fileName);
	host.readFile = fileName => fileName === rootFileName ? sourceText : originalReadFile(fileName);
	const program = createJSDocProgram([ rootFileName ], options, host, ts);
	const virtualSourceFile = program.getSourceFile(`${ rootFileName }.__lit_jsdoc__.d.ts`);
	const declaration = virtualSourceFile?.statements.find(ts.isTypeAliasDeclaration);

	if (declaration == null)
		throw new Error("The recovered JSDoc alias was not added to the Program");

	const checker = program.getTypeChecker();
	const type = checker.getTypeFromTypeNode(declaration.type);
	t.true(type.isUnion());
	t.deepEqual(type.types.map(member => checker.typeToString(member)).sort(), [ '"div"', '"span"' ]);
});

tsTest("JSDoc program preserves imported names in an ambiguous union", t => {
	const componentFileName = "/component.ts";
	const modeFileName = "/mode.ts";
	const virtualFileName = `${ componentFileName }.__lit_jsdoc__.d.ts`;
	const sourceFiles = new Map([
		[ componentFileName, 'import type { Mode } from "./mode.js";\n/** @prop {Mode|auto} value */\nclass Component {}' ],
		[ modeFileName, 'export type Mode = "open" | "closed";' ],
	]);
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.Latest,
		strict: true,
	};
	const host = ts.createCompilerHost(options);
	const originalFileExists = host.fileExists;
	const originalReadFile = host.readFile;
	host.fileExists = fileName => sourceFiles.has(fileName) || originalFileExists(fileName);
	host.readFile = fileName => sourceFiles.get(fileName) ?? originalReadFile(fileName);
	const program = createJSDocProgram([ componentFileName, modeFileName ], options, host, ts);
	const virtualSourceFile = program.getSourceFile(virtualFileName);
	const declaration = virtualSourceFile?.statements.find(ts.isTypeAliasDeclaration);

	if (virtualSourceFile == null || declaration == null)
		throw new Error("The ambiguous JSDoc alias was not added to the Program");

	const checker = program.getTypeChecker();
	const type = checker.getTypeFromTypeNode(declaration.type);
	if (!virtualSourceFile.text.includes("Mode | \"auto\""))
		throw new Error(virtualSourceFile.text);
	t.is((type.flags & ts.TypeFlags.Any) !== 0, false);
	t.deepEqual(
		program.getSemanticDiagnostics(virtualSourceFile).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n")),
		[],
	);
	t.deepEqual(
		program.getSyntacticDiagnostics(virtualSourceFile).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n")),
		[],
	);
	t.is(hasJSDocResolverDiagnostic(program, virtualSourceFile, declaration.type), false);
});

tsTest("JSDoc program preserves import-equals names in an ambiguous union", t => {
	const componentFileName = "/component.ts";
	const modeFileName = "/mode.ts";
	const virtualFileName = `${ componentFileName }.__lit_jsdoc__.d.ts`;
	const sourceFiles = new Map([
		[ componentFileName, 'import Mode = require("./mode.js");\n/** @prop {Mode|auto} value */\nclass Component {}' ],
		[ modeFileName, 'interface Mode { value: string; } export = Mode;' ],
	]);
	const options: ts.CompilerOptions = {
		module:           ts.ModuleKind.CommonJS,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		target:           ts.ScriptTarget.Latest,
		strict:           true,
	};
	const host = ts.createCompilerHost(options);
	const originalFileExists = host.fileExists;
	const originalReadFile = host.readFile;
	host.fileExists = fileName => sourceFiles.has(fileName) || originalFileExists(fileName);
	host.readFile = fileName => sourceFiles.get(fileName) ?? originalReadFile(fileName);
	const program = createJSDocProgram([ componentFileName, modeFileName ], options, host, ts);
	const virtualSourceFile = program.getSourceFile(virtualFileName);
	const declaration = virtualSourceFile?.statements.find(ts.isTypeAliasDeclaration);

	if (virtualSourceFile == null || declaration == null)
		throw new Error("The import-equals JSDoc alias was not added to the Program");

	const checker = program.getTypeChecker();
	t.true(virtualSourceFile.text.includes('Mode | "auto"'));
	t.is((checker.getTypeAtLocation(declaration.type).flags & ts.TypeFlags.Any) !== 0, false);
	t.is(hasJSDocResolverDiagnostic(program, virtualSourceFile, declaration.type), false);
});

tsTest("JSDoc program marks an unresolved alias from its own diagnostic", t => {
	const rootFileName = "component.ts";
	const sourceText = "/** @prop {MissingType} value */\nclass Component {}";
	const options: ts.CompilerOptions = { target: ts.ScriptTarget.Latest, strict: true };
	const host = ts.createCompilerHost(options);
	const originalFileExists = host.fileExists;
	const originalReadFile = host.readFile;
	host.fileExists = fileName => fileName === rootFileName || originalFileExists(fileName);
	host.readFile = fileName => fileName === rootFileName ? sourceText : originalReadFile(fileName);
	const program = createJSDocProgram([ rootFileName ], options, host, ts);
	const virtualSourceFile = program.getSourceFile(`${ rootFileName }.__lit_jsdoc__.d.ts`);
	const declaration = virtualSourceFile?.statements.find(ts.isTypeAliasDeclaration);

	if (virtualSourceFile == null || declaration == null)
		throw new Error("The unresolved JSDoc alias was not added to the Program");

	t.true(hasJSDocResolverDiagnostic(program, virtualSourceFile, declaration.type));
});

tsTest("JSDoc program does not shadow a reserved real file", t => {
	const rootFileName = "component.ts";
	const reservedFileName = `${ rootFileName }.__lit_jsdoc__.d.ts`;
	const sourceText = "/** @prop {string} value */\nclass Component {}";
	const options: ts.CompilerOptions = { target: ts.ScriptTarget.Latest, strict: true };
	const host = ts.createCompilerHost(options);
	const originalFileExists = host.fileExists;
	const originalReadFile = host.readFile;
	host.fileExists = fileName => fileName === rootFileName || fileName === reservedFileName || originalFileExists(fileName);
	host.readFile = fileName => fileName === rootFileName ? sourceText : fileName === reservedFileName ? "export {};" : originalReadFile(fileName);
	const program = createJSDocProgram([ rootFileName, reservedFileName ], options, host, ts);

	t.is(program.getSourceFile(reservedFileName)?.text, "export {};");
	t.is(program.getSourceFile(reservedFileName)?.statements.length, 1);
});
