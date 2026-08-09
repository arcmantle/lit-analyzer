import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { analyzeCommand } from '../../lib/cli/analyze-command.js';
import { LitAnalyzerCliConfig } from '../../lib/cli/lit-analyzer-cli-config.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function createSourceFile(template: string): string {
	const directory = mkdtempSync(join(tmpdir(), 'lit-analyzer-cli-'));
	temporaryDirectories.push(directory);
	const fileName = join(directory, 'element.ts');
	writeFileSync(fileName, `declare const html: any;\nhtml\`${ template }\`;\n`);

	return fileName;
}

function config(rules: LitAnalyzerCliConfig['rules'] = {}): LitAnalyzerCliConfig {
	return {
		failFast:    false,
		format:      'list',
		help:        false,
		maxWarnings: -1,
		noColor:     true,
		quiet:       false,
		rules,
	};
}

test('CLI analysis initializes its config after creating the TypeScript Program', async () => {
	vi.spyOn(console, 'log').mockImplementation(() => undefined);

	expect(await analyzeCommand([ createSourceFile('<div></div>') ], config())).toBe(true);
	expect(await analyzeCommand(
		[ createSourceFile('<unknown-element></unknown-element>') ],
		config({ 'no-unknown-tag-name': 'error' }),
	)).toBe(false);
});
