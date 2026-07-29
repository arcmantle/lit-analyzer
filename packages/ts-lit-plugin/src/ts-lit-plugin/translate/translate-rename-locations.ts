import { LitRenameLocation } from 'lit-analyzer';
import { RenameLocation } from 'typescript';

import { translateRange } from './translate-range.js';

export function translateRenameLocations(renameLocations: LitRenameLocation[]): RenameLocation[] {
	return renameLocations.map(renameLocation => translateRenameLocation(renameLocation));
}

function translateRenameLocation({ fileName, prefixText, suffixText, range }: LitRenameLocation): RenameLocation {
	const textSpan = translateRange(range);

	return {
		textSpan,
		fileName,
		prefixText,
		suffixText,
	};
}
