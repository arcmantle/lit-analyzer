#!/usr/bin/env node

import { cli } from './dist/index.js';

// eslint-disable-next-line no-console
cli().catch(console.log);
