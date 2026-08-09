import { SourceFile } from 'typescript';

export type ChangedSourceFileIterator = ((sourceFiles: readonly SourceFile[]) => IterableIterator<SourceFile>) & {
	invalidate(sourceFile: SourceFile): void;
};

/**
 * Yields source files that have changed since last time this function was called.
 */
export function changedSourceFileIterator(): ChangedSourceFileIterator {
	const sourceFileCache: WeakSet<SourceFile> = new WeakSet();

	const iterator = function* (sourceFiles: readonly SourceFile[]): IterableIterator<SourceFile> {
		for (const sourceFile of sourceFiles) {
			if (!sourceFileCache.has(sourceFile)) {
				yield sourceFile;
				sourceFileCache.add(sourceFile);
			}
		}
	};

	return Object.assign(iterator, {
		invalidate(sourceFile: SourceFile) {
			sourceFileCache.delete(sourceFile);
		},
	});
}
