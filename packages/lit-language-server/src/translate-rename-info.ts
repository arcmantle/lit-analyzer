import type { LitRenameInfo } from '@arcmantle/lit-analyzer';
import type * as ts from 'typescript';
import type { PrepareRenameResult } from 'vscode-languageserver/node';

/**
 * Translates lit-analyzer's own `LitRenameInfo` into an LSP `PrepareRenameResult`.
 * LSP's `prepareRename` only needs to
 * confirm renaming is possible and mark the span to rename, so this only
 * carries the range: there's no `canRename` field, since not renaming is
 * expressed by returning `null` instead (a position `getRenameInfoAtPosition`
 * has nothing for).
 */
export function translateRenameInfo(renameInfo: LitRenameInfo, sourceFile: ts.SourceFile): PrepareRenameResult {
	return rangeAt(sourceFile, renameInfo.range.start, renameInfo.range.end);
}

function rangeAt(sourceFile: ts.SourceFile, start: number, end: number): PrepareRenameResult {
	return {
		start: sourceFile.getLineAndCharacterOfPosition(start),
		end:   sourceFile.getLineAndCharacterOfPosition(end),
	};
}
