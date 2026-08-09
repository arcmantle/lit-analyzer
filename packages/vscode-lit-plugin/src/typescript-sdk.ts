import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_TYPESCRIPT_SDK_FILES = [ 'typescript.js', 'tsserverlibrary.js', 'lib.d.ts' ] as const;

export const TYPESCRIPT_SDK_ENVIRONMENT_VARIABLE = 'LIT_PLUGIN_TYPESCRIPT_SDK';

export function resolveTypeScriptSdkDirectory(configuredPath: string | undefined, workspaceDirectory?: string): string | undefined {
	const trimmedPath = configuredPath?.trim();
	if (trimmedPath == null || trimmedPath === '')
		return undefined;

	if (!path.isAbsolute(trimmedPath) && workspaceDirectory == null)
		throw new Error(`Relative TypeScript SDK path '${ trimmedPath }' requires an open workspace folder`);

	const sdkDirectory = path.resolve(workspaceDirectory ?? '', trimmedPath);
	const missingFiles = REQUIRED_TYPESCRIPT_SDK_FILES.filter(fileName => !fs.existsSync(path.join(sdkDirectory, fileName)));
	if (missingFiles.length > 0)
		throw new Error(`TypeScript SDK directory '${ sdkDirectory }' is missing ${ missingFiles.join(', ') }`);

	return sdkDirectory;
}
