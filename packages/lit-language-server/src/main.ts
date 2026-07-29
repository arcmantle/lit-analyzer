import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';

import { createServer } from './server.js';

createServer(createConnection(ProposedFeatures.all));
