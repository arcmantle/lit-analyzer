#!/usr/bin/env node

require('./dist/index.js')
	.cli()
	// eslint-disable-next-line no-console
	.catch(console.log);
