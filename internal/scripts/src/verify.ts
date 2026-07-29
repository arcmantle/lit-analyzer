#!/usr/bin/env node

// Runs everything that has to be green before an issue is called done, and
// reports the results in one place.
//
// This exists so that verifying the repository is a committed, reviewable
// command rather than a sequence of one-off shell invocations that drift
// between runs and disagree with CI.
//
// Usage:
//   pnpm verify                 all steps
//   pnpm verify --skip-headful  everything except the two VS Code runs
//   pnpm verify build lint      only the named steps

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const extensionDir = path.join(repoRoot, 'packages', 'vscode-lit-plugin');

interface Step {
	name:        string;
	description: string;
	cwd:         string;
	args:        string[];
	headful:     boolean;
}

const steps: Step[] = [
	{ name: 'build', description: 'compile every package', cwd: repoRoot, args: [ 'run', 'build' ], headful: false },
	{ name: 'test', description: 'lit-analyzer unit tests', cwd: repoRoot, args: [ 'run', 'test:headless' ], headful: false },
	{ name: 'lint', description: 'eslint and prettier', cwd: repoRoot, args: [ 'run', 'lint' ], headful: false },
	{ name: 'package', description: 'build the .vsix', cwd: repoRoot, args: [ 'run', 'package' ], headful: false },
	{
		name:        'headful',
		description: 'VS Code, development bundle',
		cwd:         extensionDir,
		args:        [ 'run', 'test' ],
		headful:     true,
	},
	{
		name:        'headful-packaged',
		description: 'VS Code, unzipped .vsix',
		cwd:         extensionDir,
		args:        [ 'run', 'test:packaged' ],
		headful:     true,
	},
];

function selectSteps(argv: string[]): Step[] {
	const skipHeadful = argv.includes('--skip-headful');
	const named = argv.filter(arg => !arg.startsWith('--'));

	let selected = steps;
	if (named.length > 0) {
		const unknown = named.filter(name => !steps.some(step => step.name === name));
		if (unknown.length > 0)
			throw new Error(`Unknown step(s): ${ unknown.join(', ') }. Known steps: ${ steps.map(step => step.name).join(', ') }`);

		selected = steps.filter(step => named.includes(step.name));
	}

	return skipHeadful ? selected.filter(step => !step.headful) : selected;
}

function formatDuration(ms: number): string {
	return ms >= 1000 ? `${ (ms / 1000).toFixed(1) }s` : `${ ms }ms`;
}

function run(step: Step): { ok: boolean; duration: number; } {
	const startedAt = Date.now();
	const result = spawnSync('pnpm', step.args, { cwd: step.cwd, stdio: 'inherit', shell: false });

	return { ok: result.status === 0, duration: Date.now() - startedAt };
}

function main(): void {
	const selected = selectSteps(process.argv.slice(2));
	const results: { step: Step; ok: boolean; duration: number; }[] = [];

	for (const step of selected) {
		process.stdout.write(`\n\u001b[1m▶ ${ step.name }\u001b[0m — ${ step.description }\n`);
		const { ok, duration } = run(step);
		results.push({ step, ok, duration });

		if (!ok) {
			// Stop at the first failure: later steps build on earlier ones, so
			// running them would only produce noise on top of a known break.
			break;
		}
	}

	process.stdout.write('\n');
	for (const { step, ok, duration } of results) {
		const mark = ok ? '\u001b[32mPASS\u001b[0m' : '\u001b[31mFAIL\u001b[0m';
		process.stdout.write(
			`  ${ mark }  ${ step.name.padEnd(18) } ${ formatDuration(duration).padStart(7) }  ${ step.description }\n`,
		);
	}

	const skipped = selected.length - results.length;
	if (skipped > 0)
		process.stdout.write(`  \u001b[2m----  ${ String(skipped) } step(s) not run after the failure above\u001b[0m\n`);


	const failed = results.filter(result => !result.ok);
	process.stdout.write('\n');
	process.exit(failed.length > 0 ? 1 : 0);
}

main();
