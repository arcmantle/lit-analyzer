import { SourceFile } from 'typescript';
import { expect, test } from 'vitest';

import { changedSourceFileIterator } from '../../lib/analyze/util/changed-source-file-iterator.js';

test('retries a file when an indexing batch stops before it finishes', () => {
	const firstFile = {} as SourceFile;
	const secondFile = {} as SourceFile;
	const iterator = changedSourceFileIterator();

	const firstBatch = iterator([ firstFile, secondFile ]);
	expect(firstBatch.next().value).toBe(firstFile);

	expect(Array.from(iterator([ firstFile, secondFile ]))).toEqual([ firstFile, secondFile ]);
});
