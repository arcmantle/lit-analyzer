import { pathToFileURL } from 'node:url';

import type { LitCodeFix, LitCodeFixAction } from '@arcmantle/lit-analyzer';
import type * as ts from 'typescript';
import { CodeAction, CodeActionKind, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';

/**
 * Translates lit-analyzer's own `LitCodeFix[]` into LSP `CodeAction[]`,
 * mirroring what `ts-lit-plugin`'s `translate-code-fixes.ts` does for the
 * tsserver plugin's `CodeFixAction[]`.
 *
 * Every `LitCodeFixAction` in a `LitCodeFix` edits `sourceFile` -- the same
 * file the request's position was in -- so each fix becomes one
 * `WorkspaceEdit` with a single file entry, holding one `TextEdit` per
 * action. A fix with more than one action (e.g. renaming both the opening
 * and closing tag of an element) becomes more than one `TextEdit` under
 * that same file entry, applied together.
 */
export function translateCodeFixes(codeFixes: LitCodeFix[], sourceFile: ts.SourceFile): CodeAction[] {
	return codeFixes.map(codeFix => translateCodeFix(codeFix, sourceFile));
}

function translateCodeFix(codeFix: LitCodeFix, sourceFile: ts.SourceFile): CodeAction {
	const uri = pathToFileURL(sourceFile.fileName).toString();
	const edit: WorkspaceEdit = {
		changes: {
			[uri]: codeFix.actions.map(action => translateCodeFixAction(action, sourceFile)),
		},
	};

	return {
		title: codeFix.message,
		kind:  CodeActionKind.QuickFix,
		edit,
	};
}

function translateCodeFixAction(action: LitCodeFixAction, sourceFile: ts.SourceFile): TextEdit {
	return {
		range:   rangeAt(sourceFile, action.range.start, action.range.end),
		newText: action.newText,
	};
}

function rangeAt(sourceFile: ts.SourceFile, start: number, end: number): Range {
	return {
		start: sourceFile.getLineAndCharacterOfPosition(start),
		end:   sourceFile.getLineAndCharacterOfPosition(end),
	};
}
