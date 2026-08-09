import type { LitCompletionDetails } from '@arcmantle/lit-analyzer';
import { CompletionItem, MarkupKind } from 'vscode-languageserver/node';

/**
 * Fills in an already-returned `CompletionItem`'s documentation from
 * lit-analyzer's own `LitCompletionDetails`, mirroring what `ts-lit-plugin`'s
 * `translate-completion-details.ts` does for the tsserver plugin's
 * `CompletionEntryDetails` -- except LSP renders markdown directly, so
 * there's no `displayParts`/`documentation` split to reassemble: the
 * primary info renders as a code block, and the (already markdown)
 * secondary info follows it, the same split `translate-quick-info.ts` uses
 * for hover.
 */
export function translateCompletionDetails(item: CompletionItem, details: LitCompletionDetails): CompletionItem {
	const value = details.secondaryInfo == null
		? codeBlock(details.primaryInfo)
		: `${ codeBlock(details.primaryInfo) }\n\n${ details.secondaryInfo }`;

	return {
		...item,
		documentation: { kind: MarkupKind.Markdown, value },
	};
}

// No language tag on the fence: `primaryInfo` isn't always TypeScript --
// completions are also served for CSS tagged templates via the same code
// path, so this has to render sensibly for either.
function codeBlock(text: string): string {
	return `\`\`\`\n${ text }\n\`\`\``;
}
