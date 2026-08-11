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
		expect(observations.installedExtensionIds).toContain('arcmantle.lit-analyzer');
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
	test.todo('stops reporting the missing import once it is added');

	test('completes custom element tag names', () => {
		expect(observations.completions.tagLabels).toContain('complete-me');
	});

	test('completes custom element properties', () => {
		expect(observations.completions.propertyLabels).toContain('.prop1');
		expect(observations.completions.propertyLabels).toContain('.prop2');
	});

	test('formats Lit bindings through the direct command', () => {
		expect(observations.formatting.text).toContain('html`\n<es-input');
		expect(observations.formatting.text).toContain('id         ="search"');
		expect(observations.formatting.text).toContain('size       ="small"');
		expect(observations.formatting.text).toContain('placeholder=${localize(\'info.filterCompanies\')}');
		expect(observations.formatting.text).toContain('.spellcheck=${spellcheck}');
		expect(observations.formatting.text).toContain('?readonly  =${readonly}');
		expect(observations.formatting.text).toContain('</es-input>\n`;');
		expect(observations.formatting.text).not.toContain('[#');
		expect(observations.formatting.text.indexOf('id         ="search"')).toBeLessThan(
			observations.formatting.text.indexOf('placeholder=${localize(\'info.filterCompanies\')}'),
		);
		expect(observations.formatting.text.indexOf('placeholder=${localize(\'info.filterCompanies\')}')).toBeLessThan(
			observations.formatting.text.indexOf('.spellcheck=${spellcheck}'),
		);
		expect(observations.formatting.text.indexOf('.spellcheck=${spellcheck}')).toBeLessThan(
			observations.formatting.text.indexOf('?readonly  =${readonly}'),
		);
	});

	test('the language server is running by default', () => {
		expect(observations.languageServer.runsByDefault).toBe(true);
	});

	test('restarts the language server from a command', () => {
		expect(observations.languageServer.runsAfterRestart).toBe(true);
	});

	test('uses the selected TypeScript SDK for analysis and virtual libraries', () => {
		expect(observations.selectedTypeScriptSdk).toEqual({
			configuredDirectory:            expect.stringContaining('selected-typescript-sdk'),
			virtualLibraryContainsProperty: true,
			definitionScheme:               'lit-analyzer-lib',
			definitionLine:                 '    title: string; // selected TypeScript SDK',
		});
	});

	test('opens bundled TypeScript libraries outside the file scheme', () => {
		expect(observations.virtualTypeScriptLibrary).toEqual({
			scheme:            'lit-analyzer-lib',
			languageId:        'lit-analyzer-typescript-library',
			selectorScore:     10,
			containsDomType:   true,
			diagnostics:       [],
			definitionSchemes: expect.arrayContaining([ 'lit-analyzer-lib' ]),
			definition:        {
				scheme:   'lit-analyzer-lib',
				// eslint-disable-next-line @stylistic/max-len
				lineText: 'interface HTMLElement extends Element, ElementCSSInlineStyle, ElementContentEditable, GlobalEventHandlers, HTMLOrSVGElement {',
			},
			hoverText: expect.stringContaining('interface HTMLElement'),
		});
	});
});
