import { PassThrough } from 'node:stream';

import { createMessageConnection, type MessageConnection } from 'vscode-jsonrpc/node';
import { createConnection } from 'vscode-languageserver/node';

import { createServer } from '../../server.js';

/**
 * Wires the server to an in-memory duplex pipe instead of stdio, and returns
 * a raw JSON-RPC client on the other end. This exercises the real LSP wire
 * protocol without spawning a process or touching `vscode`.
 */
export function connectToServer(): MessageConnection {
	const clientToServer = new PassThrough();
	const serverToClient = new PassThrough();

	createServer(createConnection(clientToServer, serverToClient));

	const client = createMessageConnection(serverToClient, clientToServer);
	client.listen();

	return client;
}
