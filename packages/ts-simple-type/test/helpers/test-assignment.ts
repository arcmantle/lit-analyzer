import { test } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { CompilerOptions, isBlock, Node } from "typescript";
import { inspect } from "util";
import { isAssignableToType } from "../../src/is-assignable/is-assignable-to-type.js";
import { toSimpleType } from "../../src/transform/to-simple-type.js";
import { generateCombinedTypeTestCode } from "./generate-combined-type-test-code.js";
import { TypescriptType } from "./type-test.js";
import { visitComparisonsInTestCode } from "./visit-type-comparisons.js";

/**
 * Tests all type combinations with different options
 * @param typesX
 * @param typesY
 */
export function testAssignments(typesX: TypescriptType[], typesY: TypescriptType[]) {
	if (process.env.STRICT == null || process.env.STRICT === "true") {
		testCombinedTypeAssignment(typesX, typesY, { strict: true }, { fileName: "repro-strict.ts", strictEnv: "" });
	}

	if (process.env.STRICT == null || process.env.STRICT === "false") {
		testCombinedTypeAssignment(typesX, typesY, { strict: false }, { fileName: "repro-non-strict.ts", strictEnv: "false" });
	}
}

interface ReproOptions {
	fileName: string;
	strictEnv: string;
}

/**
 * Tests all type combinations.
 *
 * The whole matrix runs inside ONE test on purpose, and every comparison is
 * checked inline rather than registered as its own test.
 *
 * `typesX * typesY` expands to tens of thousands of comparisons. Each one holds
 * a `Type`, a `Node`, a `TypeChecker` and a whole `Program`. Registering a test
 * per comparison captures all of those in a closure that stays alive until the
 * run ends, so the entire matrix is resident at once and the run exhausts
 * memory. Checking each comparison inline lets it be collected immediately, and
 * keeps the TypeScript `Program` out of the collection phase, where a crash
 * takes down the whole worker before any test reports.
 *
 * Use `TYPEA` / `TYPEB` to narrow the matrix, and `LINE` to select single cases.
 *
 * @param typesX
 * @param typesY
 * @param compilerOptions
 * @param repro
 */
export function testCombinedTypeAssignment(typesX: TypescriptType[], typesY: TypescriptType[], compilerOptions: CompilerOptions = {}, repro?: ReproOptions) {
	const optionsText = Object.entries(compilerOptions)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	test(`Assignment tests, Options: {${optionsText}}`, () => {
		const onlyLines = process.env.LINE == null ? undefined : process.env.LINE.split(",").map(Number);

		const testTitleSet = new Set<string>();
		const failures: string[] = [];
		let reproCode = "";

		const testCode = generateCombinedTypeTestCode(typesX, typesY);
		visitComparisonsInTestCode(testCode, compilerOptions, ({ assignable: expectedResult, nodeA, checker, program, typeA, typeB, typeAString, typeBString, line }) => {
			if (onlyLines != null && !onlyLines.includes(line)) {
				return;
			}

			const testTitle = `Assignment test [${line}]: "${typeAString} === ${typeBString}", Options: {${optionsText}}`;
			if (testTitleSet.has(testTitle)) return;
			testTitleSet.add(testTitle);

			const simpleTypeALazy = toSimpleType(typeA, checker, { eager: false });
			const simpleTypeBLazy = toSimpleType(typeB, checker, { eager: false });
			const simpleTypeAEager = toSimpleType(typeA, checker, { eager: true });
			const simpleTypeBEager = toSimpleType(typeB, checker, { eager: true });

			const actualResultLazy = isAssignableToType(simpleTypeALazy, simpleTypeBLazy, program);
			const actualResultEager = isAssignableToType(simpleTypeAEager, simpleTypeBEager, program);

			if (actualResultEager !== actualResultLazy) {
				failures.push(
					`${testTitle}\n  Mismatch between what isAssignableToType(...) returns for lazy type vs eager type. Eager: ${actualResultEager}. Lazy: ${actualResultLazy}. Expected result: ${expectedResult}\n  Simple Type A: ${inspect(
						simpleTypeAEager,
						false,
						5,
						false
					)}\n  Simple Type B: ${inspect(simpleTypeBEager, false, 5, false)}`
				);

				return;
			}

			const actualResult = actualResultLazy;
			const simpleTypeA = simpleTypeAEager;
			const simpleTypeB = simpleTypeBEager;

			if (actualResult === expectedResult) {
				if (process.env.DEBUG === "true") {
					console.log("");
					console.log("\x1b[4m%s\x1b[0m", testTitle);
					console.log(`Expected: ${expectedResult}, Actual: ${actualResult}`);
					console.log("");
					console.log("\x1b[1m%s\x1b[0m", "Simple Type A");
					console.log(inspect(simpleTypeA, false, 10, true));
					console.log("");
					console.log("\x1b[1m%s\x1b[0m", "Simple Type B");
					console.log(inspect(simpleTypeB, false, 10, true));
				}

				return;
			}

			const failText = `${actualResult ? "Can" : "Can't"} assign '${typeBString}' (${simpleTypeB.kind}) to '${typeAString}' (${simpleTypeA.kind}) but ${
				expectedResult ? "it should be possible!" : "it shouldn't be possible!"
			}`;

			failures.push(
				`${testTitle}\n  ${failText}\n  Simple Type A: ${inspect(simpleTypeA, false, 5, false)}\n  Simple Type B: ${inspect(simpleTypeB, false, 5, false)}`
			);

			// Report repro code for the playground
			const blockNode = findBlockNode(nodeA);
			if (blockNode != null) {
				// Generate debug log
				let log = "";
				isAssignableToType(simpleTypeALazy, simpleTypeBLazy, program, { debug: true, debugLog: text => (log += `${text}\n`) });

				reproCode += `${`${log.length > 0 ? `/*\n${log}*/\n\n` : ""}// ${failText}\n${blockNode.getText()}`}\n\n`;
			}
		});

		// Write repro code for the playground.
		//
		// This must never write inside the project. A `.ts` file written into a
		// watched tree retriggers the run, which fails again and writes again --
		// an endless loop. Write only when a directory is named explicitly, and
		// let the caller put it outside the watched tree.
		const reproDir = process.env.REPRO_DIR;
		if (repro != null && reproCode.length > 0 && reproDir != null) {
			writeFileSync(join(reproDir, repro.fileName), `// Command: DEBUG= STRICT=${repro.strictEnv} FILE=${repro.fileName} npm run playground\n\n${reproCode}`);
		}

		if (failures.length > 0) {
			const shown = failures.slice(0, MAX_REPORTED_FAILURES);
			const omitted = failures.length - shown.length;

			throw new Error(
				`${failures.length} of ${testTitleSet.size} assignment comparisons failed, Options: {${optionsText}}\n\n${shown.join("\n\n")}${
					omitted > 0 ? `\n\n...and ${omitted} more. Narrow the matrix with TYPEA/TYPEB, or select a case with LINE.` : ""
				}`
			);
		}
	});
}

/**
 * A failed run can produce thousands of entries. Printing all of them buries the
 * signal and can itself exhaust memory, so only the first few are reported.
 */
const MAX_REPORTED_FAILURES = 25;

function findBlockNode(node: Node): Node | undefined {
	if (isBlock(node)) {
		return node;
	}

	if (node.parent == null) {
		return undefined;
	}

	return findBlockNode(node.parent);
}
