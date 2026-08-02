import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { createAnalysisCompiler, createInferredAnalysisCompiler } from '../analysis-compiler.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const repoRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');

describe('analysis compiler', () => {
	test('resolves the root file names from a tsconfig', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'sample-project', 'tsconfig.json'));

		expect(
			compiler
				.getRootFileNames()
				.map(fileName => path.basename(fileName))
				.sort(),
		).toEqual([ 'a.ts', 'b.ts' ]);
	});

	test('getProgram() returns a usable Program containing the resolved files', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'sample-project', 'tsconfig.json'));

		const program = compiler.getProgram();
		const sourceFileNames = program
			.getSourceFiles()
			.map(sourceFile => path.basename(sourceFile.fileName))
			.filter(name => !name.startsWith('lib.'));

		expect(sourceFileNames.sort()).toEqual([ 'a.ts', 'b.ts' ]);
	});

	test('getSignatureHelpItems returns the signature of a call at the given position', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'sample-project', 'tsconfig.json'));
		const aFileName = path.join(fixturesDir, 'sample-project', 'a.ts');

		const text = 'function greet(name: string): void {}\ngreet(';
		compiler.openDocument(aFileName, text);

		const items = compiler.getSignatureHelpItems(aFileName, text.length);

		expect(items).toBeDefined();
		expect(items!.items).toHaveLength(1);
		expect(items!.items[0].parameters.map(parameter => parameter.name)).toEqual([ 'name' ]);
	});

	test('compilerOptions.paths resolve to the right file', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'paths-project', 'tsconfig.json'));

		const program = compiler.getProgram();
		const indexFile = program.getSourceFile(path.join(fixturesDir, 'paths-project', 'index.ts'));
		expect(indexFile).toBeDefined();

		// A missing-module error would show up as a semantic diagnostic on the
		// import specifier if '@lib/*' hadn't resolved.
		const diagnostics = program.getSemanticDiagnostics(indexFile);
		expect(diagnostics).toEqual([]);
	});

	// The acceptance criterion "Verified against the playground" is enforced here
	// rather than by a one-off manual check, so a regression in either this
	// module or packages/playground/tsconfig.json is caught automatically.
	test("verified against packages/playground/: resolves the playground project's Program", () => {
		const compiler = createAnalysisCompiler(path.join(repoRoot, 'packages', 'playground', 'tsconfig.json'));

		const rootFileNames = compiler.getRootFileNames().map(fileName => path.basename(fileName));
		expect(rootFileNames.sort()).toEqual([ 'my-element-1.ts', 'my-element-2.js' ]);

		const program = compiler.getProgram();
		expect(program.getSourceFile(compiler.getRootFileNames()[0])).toBeDefined();
	});
});

describe('analysis compiler tracks unsaved document content', () => {
	function fileNameOf(baseName: string): string {
		return path.join(fixturesDir, 'sample-project', baseName);
	}

	test('openDocument makes the Program reflect unsaved edits instead of disk content', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'sample-project', 'tsconfig.json'));
		const aFileName = fileNameOf('a.ts');

		compiler.openDocument(aFileName, 'export const a = "edited, not saved";');

		const sourceFile = compiler.getProgram().getSourceFile(aFileName);
		expect(sourceFile?.text).toContain('edited, not saved');
	});

	test('updateDocument re-parses the file only when its content actually changes', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'sample-project', 'tsconfig.json'));
		const aFileName = fileNameOf('a.ts');

		compiler.openDocument(aFileName, 'export const a = "first";');
		const sourceFileAfterOpen = compiler.getProgram().getSourceFile(aFileName);

		compiler.updateDocument(aFileName, 'export const a = "first";');
		const sourceFileAfterNoopUpdate = compiler.getProgram().getSourceFile(aFileName);
		expect(sourceFileAfterNoopUpdate).toBe(sourceFileAfterOpen);

		compiler.updateDocument(aFileName, 'export const a = "second";');
		const sourceFileAfterRealUpdate = compiler.getProgram().getSourceFile(aFileName);
		expect(sourceFileAfterRealUpdate).not.toBe(sourceFileAfterOpen);
		expect(sourceFileAfterRealUpdate?.text).toContain('second');
	});

	test('closeDocument reverts the Program to disk content', () => {
		const compiler = createAnalysisCompiler(path.join(fixturesDir, 'sample-project', 'tsconfig.json'));
		const aFileName = fileNameOf('a.ts');
		const diskText = fs.readFileSync(aFileName, 'utf8');

		compiler.openDocument(aFileName, 'export const a = "edited, not saved";');
		compiler.closeDocument(aFileName);

		const sourceFile = compiler.getProgram().getSourceFile(aFileName);
		expect(sourceFile?.text).toBe(diskText);
	});
});

describe('createInferredAnalysisCompiler', () => {
	function withTempDir(run: (dir: string) => void): void {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inferred-project-'));
		try {
			run(dir);
		}
		finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}

	test('builds a Program containing just the given file', () => {
		withTempDir(dir => {
			const fileName = path.join(dir, 'standalone.ts');
			fs.writeFileSync(fileName, 'export const value = 1;');

			const compiler = createInferredAnalysisCompiler(fileName);

			expect(compiler.getRootFileNames()).toEqual([ fileName ]);
			expect(compiler.getProgram().getSourceFile(fileName)).toBeDefined();
		});
	});

	test("resolves the standalone file's own relative imports", () => {
		withTempDir(dir => {
			const helperName = path.join(dir, 'helper.ts');
			const fileName = path.join(dir, 'standalone.ts');
			fs.writeFileSync(helperName, 'export const helperValue = 2;');
			fs.writeFileSync(fileName, 'import { helperValue } from "./helper.js";\nexport const value = helperValue;');

			const compiler = createInferredAnalysisCompiler(fileName);
			const program = compiler.getProgram();

			expect(program.getSourceFile(helperName)).toBeDefined();
			expect(program.getSemanticDiagnostics(program.getSourceFile(fileName))).toEqual([]);
		});
	});

	test('tracks unsaved content the same way a tsconfig-backed project does', () => {
		withTempDir(dir => {
			const fileName = path.join(dir, 'standalone.ts');
			fs.writeFileSync(fileName, 'export const value = 1;');

			const compiler = createInferredAnalysisCompiler(fileName);
			compiler.openDocument(fileName, 'export const value = "edited, not saved";');

			const sourceFile = compiler.getProgram().getSourceFile(fileName);
			expect(sourceFile?.text).toContain('edited, not saved');
		});
	});
});
