import type * as ts from 'typescript';
import type { ParameterInformation, SignatureHelp, SignatureInformation } from 'vscode-languageserver/node';

/**
 * Translates TypeScript's own `ts.SignatureHelpItems` into an LSP
 * `SignatureHelp`: a directive call (e.g. `classMap(...)`)
 * inside a template is an ordinary TypeScript call expression, so its
 * signature help needs no lit-specific handling and is passed through as-is.
 * The one thing filtered out is the single, unhelpful signature of the
 * `html`/`css` tag function itself, which TypeScript offers when the cursor
 * sits in the tagged template but not inside any of its own call
 * expressions.
 */
export function translateSignatureHelp(items: ts.SignatureHelpItems | undefined): SignatureHelp | null {
	if (items == null || isLitTagSignature(items))
		return null;


	return {
		signatures:      items.items.map(translateSignatureHelpItem),
		activeSignature: items.selectedItemIndex,
		activeParameter: items.argumentIndex,
	};
}

/**
 * True when `items` is exactly the `html`/`css` tag function's own
 * signature -- the only signature TypeScript can offer when the cursor is
 * in a tagged template but not inside a nested call within it.
 */
function isLitTagSignature(items: ts.SignatureHelpItems): boolean {
	if (items.items.length !== 1)
		return false;

	const [ prefix ] = items.items[0].prefixDisplayParts;

	return prefix?.kind === 'aliasName' && (prefix.text === 'html' || prefix.text === 'css');
}

function translateSignatureHelpItem(item: ts.SignatureHelpItem): SignatureInformation {
	const separator = displayPartsToString(item.separatorDisplayParts);

	let label = displayPartsToString(item.prefixDisplayParts);
	const parameters: ParameterInformation[] = item.parameters.map((parameter, index) => {
		if (index > 0)
			label += separator;

		const start = label.length;
		label += displayPartsToString(parameter.displayParts);
		const documentation = displayPartsToString(parameter.documentation);

		return {
			label:         [ start, label.length ] as [number, number],
			documentation: documentation === '' ? undefined : documentation,
		};
	});
	label += displayPartsToString(item.suffixDisplayParts);

	const documentation = displayPartsToString(item.documentation);

	return {
		label,
		documentation: documentation === '' ? undefined : documentation,
		parameters,
	};
}

function displayPartsToString(parts: readonly ts.SymbolDisplayPart[]): string {
	return parts.map(part => part.text).join('');
}
