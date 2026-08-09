#!/usr/bin/env node

import { cli } from './dist/lib/index.js';

// eslint-disable-next-line no-console
cli().catch(console.log);
