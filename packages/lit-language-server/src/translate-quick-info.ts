import type { LitQuickInfo } from '@arcmantle/lit-analyzer';
import type * as ts from 'typescript';
import { Hover, MarkupKind } from 'vscode-languageserver/node';

/**
 * Translates lit-analyzer's own `LitQuickInfo` into an LSP `Hover`.
 * LSP renders markdown directly,
 * so there's no `displayParts`/`documentation` split to reassemble: the
 * primary info renders as a code block, and the (already markdown)
 * secondary info follows it.
 */
export function translateQuickInfo(quickInfo: LitQuickInfo, sourceFile: ts.SourceFile): Hover {
	const start = sourceFile.getLineAndCharacterOfPosition(quickInfo.range.start);
	const end = sourceFile.getLineAndCharacterOfPosition(quickInfo.range.end);

	const value =
		quickInfo.secondaryInfo == null
			? codeBlock(quickInfo.primaryInfo)
			: `${ codeBlock(quickInfo.primaryInfo) }\n\n${ quickInfo.secondaryInfo }`;

	return {
		contents: { kind: MarkupKind.Markdown, value },
		range:    { start, end },
	};
}

// No language tag on the fence: `primaryInfo` isn't always TypeScript --
// `getQuickInfoAtPosition` also serves CSS tagged templates via the same
// code path, so this has to render sensibly for either.
function codeBlock(text: string): string {
	return `\`\`\`\n${ text }\n\`\`\``;
}
