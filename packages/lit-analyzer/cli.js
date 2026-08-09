#!/usr/bin/env node

import { cli } from './dist/lib/index.js';

cli().catch(error => {
	// eslint-disable-next-line no-console
	console.error(error);
	process.exitCode = 1;
});
