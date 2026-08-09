import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const TYPESCRIPT_SDK_ENVIRONMENT_VARIABLE = 'LIT_PLUGIN_TYPESCRIPT_SDK';

export function selectedTypeScriptModulePath(specifier: string, sdkDirectory: string): string | undefined {
	switch (specifier) {
	case 'typescript':
		return path.join(sdkDirectory, 'typescript.js');
	case 'typescript/lib/tsserverlibrary.js':
		return path.join(sdkDirectory, 'tsserverlibrary.js');
	default:
		return undefined;
	}
}

export function registerTypeScriptSdk(sdkDirectory: string): void {
	registerHooks({
		resolve(specifier, context, nextResolve) {
			const modulePath = selectedTypeScriptModulePath(specifier, sdkDirectory);
			if (modulePath == null)
				return nextResolve(specifier, context);

			return nextResolve(pathToFileURL(modulePath).href, context);
		},
	});
}
