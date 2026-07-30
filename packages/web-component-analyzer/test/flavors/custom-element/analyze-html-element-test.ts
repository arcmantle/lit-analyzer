import { join } from "path";
import { analyzeHTMLElement } from "../../../src/analyze/analyze-html-element.js";
import { ComponentHeritageClause } from "../../../src/analyze/types/component-declaration.js";
import { getCurrentTsModule, getCurrentTsModuleDirectory, tsTest } from "../../helpers/ts-test.js";
import { getComponentProp } from "../../helpers/util.js";

tsTest("analyzeHTMLElement returns correct result", t => {
	const tsModule = getCurrentTsModule();
	const program = tsModule.createProgram([join(getCurrentTsModuleDirectory(), "lib.dom.d.ts")], {});
	const result = analyzeHTMLElement(program, tsModule);

	t.truthy(result);

	const ext = getAllInheritedNames(result!.heritageClauses);

	// Test that the node extends some of the interfaces.
	//
	// Upstream also asserted `DocumentAndElementEventHandlers` here, behind a
	// `!version.startsWith("5.")` guard. TypeScript 5 dropped that interface from
	// `HTMLElement`'s heritage in `lib.dom.d.ts` and TypeScript 6 has not brought
	// it back, so on the pinned compiler the guard let a dead assertion through.
	// The assertion is gone with the version matrix.
	t.truthy(ext.has("GlobalEventHandlers"));
	t.truthy(ext.has("EventTarget"));
	t.truthy(ext.has("Node"));
	t.truthy(ext.has("ElementContentEditable"));

	// From ElementContentEditable interface
	t.truthy(getComponentProp(result!.members, "contentEditable"));
	// From Node interface
	t.truthy(getComponentProp(result!.members, "baseURI"));
	// From EventTarget interface
	t.truthy(result!.methods.find(m => m.name === "addEventListener"));
});

function getAllInheritedNames(heritageClauses: ComponentHeritageClause[], names: Set<string> = new Set()) {
	for (const heritageClause of heritageClauses) {
		names.add(heritageClause.identifier.getText());
		if (heritageClause.declaration != null) {
			getAllInheritedNames(heritageClause.declaration.heritageClauses, names);
		}
	}

	return names;
}
