type SendOpen<Document> = (document: Document) => Promise<void>;

interface PendingOpen<Document> {
	send: SendOpen<Document>;
}

export class VisibleDocumentSynchronization<Document extends { uri: unknown; }> {

	private readonly pendingOpens: Map<string, PendingOpen<Document>> = new Map();

	constructor(private readonly isVisible: (document: Document) => boolean) {}

	async didOpen(document: Document, send: SendOpen<Document>): Promise<void> {
		if (this.isVisible(document))
			return send(document);


		this.pendingOpens.set(String(document.uri), { send });
	}

	async didChange(document: Document, send: (document: Document) => Promise<void>): Promise<void> {
		if (this.pendingOpens.has(String(document.uri)))
			return;


		await send(document);
	}

	async didClose(document: Document, send: (document: Document) => Promise<void>): Promise<void> {
		if (this.pendingOpens.delete(String(document.uri)))
			return;


		await send(document);
	}

	async didBecomeVisible(document: Document): Promise<void> {
		if (!this.isVisible(document))
			return;


		const uri = String(document.uri);
		const pending = this.pendingOpens.get(uri);
		if (pending == null)
			return;


		this.pendingOpens.delete(uri);
		try {
			await pending.send(document);
		}
		catch (error) {
			this.pendingOpens.set(uri, pending);
			throw error;
		}
	}

}
