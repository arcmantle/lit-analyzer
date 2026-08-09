import { pathToFileURL } from 'node:url';

import type { LitDefinition, LitDefinitionTarget } from '@arcmantle/lit-analyzer';
import type * as ts from 'typescript';
import { LocationLink, Range } from 'vscode-languageserver/node';

/**
 * Translates lit-analyzer's own `LitDefinition` into LSP `LocationLink[]`,
 * mirroring what `ts-lit-plugin`'s `translate-definition.ts` does for the
 * tsserver plugin's `DefinitionInfoAndBoundSpan`.
 *
 * `originSourceFile` is the file the request's position was in -- the same
 * file passed to `LitAnalyzer.getDefinitionAtPosition` -- used to translate
 * `definition.fromRange` into `originSelectionRange`.
 */
export function translateDefinition(definition: LitDefinition, originSourceFile: ts.SourceFile): LocationLink[] {
	const originSelectionRange = rangeAt(originSourceFile, definition.fromRange.start, definition.fromRange.end);

	return definition.targets.map(target => translateDefinitionTarget(target, originSelectionRange));
}

function translateDefinitionTarget(target: LitDefinitionTarget, originSelectionRange: Range): LocationLink {
	const targetSourceFile = target.kind === 'node' ? target.node.getSourceFile() : target.sourceFile;
	const start = target.kind === 'node' ? target.node.getStart() : target.range.start;
	const end = target.kind === 'node' ? target.node.getEnd() : target.range.end;
	const targetRange = rangeAt(targetSourceFile, start, end);

	return {
		originSelectionRange,
		targetUri:            pathToFileURL(targetSourceFile.fileName).toString(),
		// The plugin's `DefinitionInfo` only carries one `textSpan`, not a
		// separate "whole declaration" span and "selection" span, so both LSP
		// ranges point at the same span here.
		targetRange,
		targetSelectionRange: targetRange,
	};
}

function rangeAt(sourceFile: ts.SourceFile, start: number, end: number): Range {
	return {
		start: sourceFile.getLineAndCharacterOfPosition(start),
		end:   sourceFile.getLineAndCharacterOfPosition(end),
	};
}
