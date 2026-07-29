import { describe, expect, test } from 'vitest';
import type { InitializeParams } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

function initializeParams(): InitializeParams {
	return { processId: null, rootUri: null, capabilities: {} };
}

describe('lit-language-server LSP handshake', () => {
	test('responds to an initialize request with server capabilities', async () => {
		const client = connectToServer();

		const result = await client.sendRequest('initialize', initializeParams());

		expect(result).toHaveProperty('capabilities');
	});

	test('logs that it is alive once initialized', async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});

		await client.sendRequest('initialize', initializeParams());

		expect(logMessages).toEqual([ 'lit-language-server started and completed the LSP handshake' ]);
	});
});
