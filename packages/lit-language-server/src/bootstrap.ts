import { registerTypeScriptSdk, TYPESCRIPT_SDK_ENVIRONMENT_VARIABLE } from './typescript-sdk-loader.js';

const sdkDirectory = process.env[TYPESCRIPT_SDK_ENVIRONMENT_VARIABLE];
if (sdkDirectory != null)
	registerTypeScriptSdk(sdkDirectory);

await import('./main.js');
