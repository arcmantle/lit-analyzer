import { beforeAll, describe, expect, test } from 'vitest';

import { collectObservations, extensionUnderTest } from './helpers/launch-vscode.js';
import type { Observations } from './scripts/collect-observations.js';

// Launching VS Code is slow, so every assertion below reads from a single run.
let observations: Observations;

beforeAll(async () => {
	observations = await collectObservations();
}, 300_000);

describe(`lit-plugin in VS Code (${ extensionUnderTest() } extension)`, () => {
	test('the extension is installed', () => {
		expect(observations.installedExtensionIds).toContain('runem.lit-plugin');
	});

	test('reports an element missing from HTMLElementTagNameMap', () => {
		expect(observations.missingElementTypeDiagnostics).toEqual([
			"'my-element' has not been \
registered on HTMLElementTagNameMap",
		]);
	});

	test('reports a missing import', () => {
		expect(observations.missingImport.beforeFix).toEqual([ "Missing import for <my-other-element>\n  You can disable this check by disabling the 'no-missing-import' rule." ]);
	});

	// Adding the import does not clear the diagnostic: the analyzer keeps serving a
	// cached view of the document's components. That is the gap tracked by
	// ISS_4H4W1Q8QX39NJSX2E3KQ5XMYSS.
	//
	// The mocha suite this replaced looked like it covered this, but its assertion
	// was `assert.rejects(...)` with no `await`, so the promise floated and the
	// check never ran. Unskip once cache invalidation lands.
	test.skip('stops reporting the missing import once it is added', () => {
		expect(observations.missingImport.clearedAfterFix).toBe(true);
	});

	test('completes custom element tag names', () => {
		expect(observations.completions.tagLabels).toContain('complete-me');
	});

	test('completes custom element properties', () => {
		expect(observations.completions.propertyLabels).toContain('.prop1');
		expect(observations.completions.propertyLabels).toContain('.prop2');
	});

	test('the language server is running by default', () => {
		expect(observations.languageServer.runsByDefault).toBe(true);
	});
});
