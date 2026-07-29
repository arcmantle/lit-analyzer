import type { LitCompletion, LitTargetKind } from 'lit-analyzer';
import type * as ts from 'typescript';
import { CompletionItem, CompletionItemKind, Range, TextEdit } from 'vscode-languageserver/node';

/**
 * Data carried on every `CompletionItem` this module produces, so a later
 * `completionItem/resolve` request (see `translate-completion-details.ts`)
 * knows which file and position to ask `LitAnalyzer.getCompletionDetailsAtPosition`
 * about -- the same file and position `getCompletionsAtPosition` was called
 * with to produce this item in the first place.
 */
export interface LitCompletionItemData {
	fileName: string;
	position: number;
	name:     string;
}

/**
 * Translates lit-analyzer's own `LitCompletion[]` into LSP `CompletionItem[]`,
 * mirroring what `ts-lit-plugin`'s `translate-completions.ts` does for the
 * tsserver plugin's `CompletionInfo`. Tag name, attribute, property, event,
 * slot, CSS part and CSS custom property completions all go through this
 * same translation -- `LitCompletion` doesn't distinguish between them.
 *
 * Each item's `data` records `fileName` and `position` so `onCompletionResolve`
 * can ask the analyzer for that completion's documentation without the
 * client having to round-trip anything back except the item itself.
 */
export function translateCompletions(
	completions: LitCompletion[],
	sourceFile: ts.SourceFile,
	fileName: string,
	position: number,
): CompletionItem[] {
	return completions.map(completion => translateCompletion(completion, sourceFile, fileName, position));
}

function translateCompletion(
	completion: LitCompletion,
	sourceFile: ts.SourceFile,
	fileName: string,
	position: number,
): CompletionItem {
	const { name, kind, insert, range, importance, sortText, kindModifiers } = completion;

	const data: LitCompletionItemData = { fileName, position, name };

	const item: CompletionItem = {
		label:    name,
		// A CSS custom property completion with a color value (e.g.
		// `--brand-color: #ff0000`) carries `kindModifiers: "color"`, which
		// takes priority over the target-kind mapping below so the editor
		// shows a color swatch, the same as `ts-lit-plugin`'s completions do.
		kind:     kindModifiers === 'color' ? CompletionItemKind.Color : translateCompletionItemKind(kind),
		sortText: sortText ?? (importance === 'high' ? '0' : importance === 'medium' ? '1' : '2'),
		data,
	};

	if (range != null)
		item.textEdit = TextEdit.replace(rangeAt(sourceFile, range.start, range.end), insert);
	else
		item.insertText = insert;


	return item;
}

function rangeAt(sourceFile: ts.SourceFile, start: number, end: number): Range {
	return {
		start: sourceFile.getLineAndCharacterOfPosition(start),
		end:   sourceFile.getLineAndCharacterOfPosition(end),
	};
}

function translateCompletionItemKind(kind: LitTargetKind): CompletionItemKind {
	switch (kind) {
	case 'memberFunctionElement':
		return CompletionItemKind.Method;
	case 'functionElement':
		return CompletionItemKind.Function;
	case 'constructorImplementationElement':
		return CompletionItemKind.Constructor;
	case 'variableElement':
		return CompletionItemKind.Variable;
	case 'classElement':
		return CompletionItemKind.Class;
	case 'interfaceElement':
		return CompletionItemKind.Interface;
	case 'moduleElement':
		return CompletionItemKind.Module;
	case 'memberVariableElement':
	case 'member':
		return CompletionItemKind.Property;
	case 'constElement':
		return CompletionItemKind.Constant;
	case 'enumElement':
		return CompletionItemKind.EnumMember;
	case 'keyword':
		return CompletionItemKind.Keyword;
	case 'alias':
		return CompletionItemKind.Reference;
	case 'label':
		return CompletionItemKind.Text;
	default:
		return CompletionItemKind.Text;
	}
}
