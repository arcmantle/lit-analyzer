// Runs in plain Node under Vitest.
//
// Launches a real VS Code with the extension loaded, lets
// ./scripts/collect-observations.ts drive the editor from inside the extension
// host, and hands back what it saw.

import { runTests } from '@vscode/test-electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type { Observations } from '../scripts/collect-observations.js';

// This file lives at <package>/src/test/helpers, so the package root is four
// levels up. Derived from the module's own location rather than the working
// directory, so it does not depend on where the test runner was started.
const packageRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

/**
 * Which build of the extension to load.
 *
 * `built` is what a developer just compiled. `packaged` is the unzipped `.vsix`,
 * which is what users actually install -- worth running because the packaging
 * step rewrites the manifest and copies files around.
 */
export type ExtensionUnderTest = 'built' | 'packaged';

const EXTENSION_PATHS: Record<ExtensionUnderTest, string> = {
	built:    path.join(packageRoot, 'built'),
	packaged: path.join(packageRoot, 'out', 'packaged-extension', 'extension'),
};

export function extensionUnderTest(): ExtensionUnderTest {
	return process.env.LIT_PLUGIN_EXTENSION === 'packaged' ? 'packaged' : 'built';
}

export async function collectObservations(target: ExtensionUnderTest = extensionUnderTest()): Promise<Observations> {
	const extensionDevelopmentPath = EXTENSION_PATHS[target];
	if (!fs.existsSync(extensionDevelopmentPath))
		throw new Error(`No extension at ${ extensionDevelopmentPath }. Run \`pnpm run build\` first.`);


	// The in-host half has to be JavaScript that the extension host can require,
	// so it is used from the TypeScript build output rather than from source.
	const extensionTestsPath = path.join(packageRoot, 'out', 'test', 'scripts', 'collect-observations.js');
	if (!fs.existsSync(extensionTestsPath))
		throw new Error(`No compiled test host at ${ extensionTestsPath }. Run \`pnpm run build\` first.`);


	// VS Code opens a unix socket inside the user data directory, and a unix
	// socket path cannot exceed ~103 characters. The default lands under
	// .vscode-test inside this package, which busts that limit as soon as the
	// checkout sits a few directories deep, and the run dies with EINVAL before
	// any test executes. Keep the user data directory short and out of the way.
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lit-plugin-test-'));
	const observationsPath = path.join(userDataDir, 'observations.json');

	try {
		await runTests({
			version:           '1.130.0',
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs:        [ path.join(packageRoot, 'src', 'test', 'fixtures'), `--user-data-dir=${ userDataDir }` ],
			extensionTestsEnv: { LIT_PLUGIN_OBSERVATIONS: observationsPath },
		});

		if (!fs.existsSync(observationsPath))
			throw new Error('VS Code exited without writing any observations');


		return JSON.parse(fs.readFileSync(observationsPath, 'utf8')) as Observations;
	}
	finally {
		fs.rmSync(userDataDir, { recursive: true, force: true });
	}
}
