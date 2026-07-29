import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';
import type { InitializeParams } from 'vscode-languageserver/node';

import { connectToServer } from './helpers/connect-to-server.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const fixtureProject = path.join(fixturesDir, 'sample-project');
const discoveryProjectDir = path.join(fixturesDir, 'tsconfig-discovery');

function initializeParamsWithRoot(rootPath: string): InitializeParams {
	return { processId: null, rootUri: pathToFileURL(rootPath).toString(), capabilities: {} };
}

describe('lit-language-server boots the analysis compiler', () => {
	test('logs the resolved file count for a known fixture project', async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(fixtureProject));

		expect(logMessages).toContainEqual(expect.stringContaining('sees 2 source file(s)'));
	});

	// The client's root can be a subdirectory with no tsconfig.json of its
	// own -- the server must walk up to find the nearest ancestor's, the
	// same as `findNearestTsconfig` does on its own.
	test("walks up from the root to find an ancestor's tsconfig.json", async () => {
		const client = connectToServer();
		const logMessages: string[] = [];
		client.onNotification('window/logMessage', (params: { message: string; }) => {
			logMessages.push(params.message);
		});

		await client.sendRequest('initialize', initializeParamsWithRoot(path.join(discoveryProjectDir, 'nested', 'deep')));

		expect(logMessages).toContainEqual(expect.stringContaining(path.join(discoveryProjectDir, 'tsconfig.json')));
	});

	// A root outside the repo entirely, so walking up finds no tsconfig.json
	// anywhere above it -- unlike a root inside this monorepo, which would
	// always eventually find the repo's own tsconfig.json walking up. The
	// handshake must still succeed -- only the compiler boot is skipped --
	// rather than failing initialize entirely.
	test('still completes the handshake when no tsconfig.json exists above the root', async () => {
		const client = connectToServer();
		const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lit-language-server-no-tsconfig-'));

		try {
			const result = await client.sendRequest('initialize', initializeParamsWithRoot(rootPath));

			expect(result).toHaveProperty('capabilities');
		}
		finally {
			fs.rmSync(rootPath, { recursive: true, force: true });
		}
	});
});
