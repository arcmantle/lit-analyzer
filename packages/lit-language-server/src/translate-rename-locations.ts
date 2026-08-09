import { pathToFileURL } from 'node:url';

import type { LitRenameLocation } from '@arcmantle/lit-analyzer';
import type * as ts from 'typescript';
import { Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver/node';

/**
 * Translates lit-analyzer's own `LitRenameLocation[]` into an LSP
 * `WorkspaceEdit`. LSP's `textDocument/rename` wants every edit
 * up front as one `WorkspaceEdit`, rather than a list of spans the client
 * fills in with the new name itself, so `newName` is applied here.
 *
 * Locations can span several files (a tag's declaration plus every template
 * usage), so each location's file is looked up in `program` to translate its
 * offsets into an LSP `Range`; a location for a file no longer in the
 * `Program` is skipped rather than failing the whole rename.
 */
export function translateRenameLocations(
	renameLocations: LitRenameLocation[],
	newName: string,
	program: ts.Program,
): WorkspaceEdit {
	const changes: Record<string, TextEdit[]> = {};

	for (const location of renameLocations) {
		const sourceFile = program.getSourceFile(location.fileName);
		if (sourceFile == null)
			continue;


		const uri = pathToFileURL(sourceFile.fileName).toString();
		const edit: TextEdit = {
			range:   rangeAt(sourceFile, location.range.start, location.range.end),
			// `prefixText`/`suffixText` are literal text either side of the
			// renamed span, not part of what the user typed -- e.g. a plugin
			// could ask a template usage to read `<foo>` instead of `foo` for a
			// tag rename, without asking the user to type the angle brackets.
			newText: `${ location.prefixText ?? '' }${ newName }${ location.suffixText ?? '' }`,
		};

		(changes[uri] ??= []).push(edit);
	}

	return { changes };
}

function rangeAt(sourceFile: ts.SourceFile, start: number, end: number): Range {
	return {
		start: sourceFile.getLineAndCharacterOfPosition(start),
		end:   sourceFile.getLineAndCharacterOfPosition(end),
	};
}
