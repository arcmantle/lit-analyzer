import { LitRenameInfo } from 'lit-analyzer';
import { RenameInfo } from 'typescript';

import { translateRange } from './translate-range.js';
import { translateTargetKind } from './translate-target-kind.js';

export function translateRenameInfo({ displayName, fullDisplayName, kind, range }: LitRenameInfo): RenameInfo {
	const triggerSpan = translateRange(range);

	return {
		canRename:     true,
		kind:          translateTargetKind(kind),
		kindModifiers: '',
		displayName,
		fullDisplayName,
		triggerSpan,
	};
}
