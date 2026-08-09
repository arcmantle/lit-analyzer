import { describe, expect, test, vi } from 'vitest';

import { VisibleDocumentSynchronization } from '../visible-document-synchronization.js';

interface TestDocument {
	uri:     string;
	version: number;
}

describe('VisibleDocumentSynchronization', () => {
	test('opens a restored hidden document only after it becomes visible', async () => {
		const visibleUris: Set<string> = new Set();
		const synchronization: VisibleDocumentSynchronization<TestDocument> = new VisibleDocumentSynchronization(document => visibleUris.has(document.uri));
		const sendOpen = vi.fn(async (_document: TestDocument) => {});
		const restoredDocument = { uri: 'file:///restored.ts', version: 1 };

		await synchronization.didOpen(restoredDocument, sendOpen);
		expect(sendOpen).not.toHaveBeenCalled();

		visibleUris.add(restoredDocument.uri);
		const visibleDocument = { ...restoredDocument, version: 2 };
		await synchronization.didBecomeVisible(visibleDocument);

		expect(sendOpen).toHaveBeenCalledOnce();
		expect(sendOpen).toHaveBeenCalledWith(visibleDocument);
	});

	test('does not close a document that was never opened', async () => {
		const visibleUris: Set<string> = new Set();
		const synchronization: VisibleDocumentSynchronization<TestDocument> = new VisibleDocumentSynchronization(document => visibleUris.has(document.uri));
		const sendOpen = vi.fn(async (_document: TestDocument) => {});
		const sendClose = vi.fn(async (_document: TestDocument) => {});
		const document = { uri: 'file:///restored.ts', version: 1 };

		await synchronization.didOpen(document, sendOpen);
		await synchronization.didClose(document, sendClose);
		visibleUris.add(document.uri);
		await synchronization.didBecomeVisible(document);

		expect(sendClose).not.toHaveBeenCalled();
		expect(sendOpen).not.toHaveBeenCalled();
	});

	test('sends changes only after the document has opened', async () => {
		const visibleUris: Set<string> = new Set();
		const synchronization: VisibleDocumentSynchronization<TestDocument> = new VisibleDocumentSynchronization(document => visibleUris.has(document.uri));
		const sendOpen = vi.fn(async (_document: TestDocument) => {});
		const sendChange = vi.fn(async (_document: TestDocument) => {});
		const hiddenDocument = { uri: 'file:///restored.ts', version: 1 };

		await synchronization.didOpen(hiddenDocument, sendOpen);
		await synchronization.didChange(hiddenDocument, sendChange);
		expect(sendChange).not.toHaveBeenCalled();

		visibleUris.add(hiddenDocument.uri);
		const visibleDocument = { ...hiddenDocument, version: 2 };
		await synchronization.didBecomeVisible(visibleDocument);
		await synchronization.didChange(visibleDocument, sendChange);

		expect(sendChange).toHaveBeenCalledOnce();
		expect(sendChange).toHaveBeenCalledWith(visibleDocument);
	});

	test('keeps an open pending when sending it fails', async () => {
		const visibleUris = new Set([ 'file:///restored.ts' ]);
		const synchronization: VisibleDocumentSynchronization<TestDocument> = new VisibleDocumentSynchronization(document => visibleUris.has(document.uri));
		const sendOpen = vi.fn()
			.mockRejectedValueOnce(new Error('send failed'))
			.mockResolvedValueOnce(undefined);
		const document = { uri: 'file:///restored.ts', version: 1 };

		visibleUris.clear();
		await synchronization.didOpen(document, sendOpen);
		visibleUris.add(document.uri);

		await expect(synchronization.didBecomeVisible(document)).rejects.toThrow('send failed');
		await synchronization.didBecomeVisible(document);

		expect(sendOpen).toHaveBeenCalledTimes(2);
	});
});
