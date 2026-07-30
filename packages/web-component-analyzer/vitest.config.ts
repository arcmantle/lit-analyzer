import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The vendored upstream suite names its files `*-test.ts`, `*.spec.ts` and,
		// for the snapshot entries, plain `*.ts`. None of those are Vitest defaults.
		// Every `.ts` under `test/` is a test file except the shared helpers, so the
		// names are left alone and the whole directory is included instead.
		include: [ 'test/**/*.ts' ],
		exclude: [
			'test/helpers/**',

			// The snapshot entries glob `dev/node_modules`, which is a separate npm
			// install of 19 third-party packages pinned in 2019. They also assert
			// nothing: upstream replaced the snapshot comparison in
			// `helpers/test-result-snapshot.ts` with `t.pass("Temporary ignore
			// snapshot testing")` and never restored it. Running them would cost a
			// stale install and prove nothing, so they stay out of the suite until
			// the comparison comes back.
			'test/snapshots/**',
		],

		// Every test builds a real TypeScript Program. Those are expensive enough
		// that one worker per core will exhaust memory on a developer machine, so
		// the pool is bounded rather than scaled to the CPU count.
		//
		// This must stay `maxWorkers`. Vitest 4 has no `poolOptions.forks.maxForks`,
		// and an unknown key here is ignored in silence -- which puts the pool back
		// to one worker per core.
		pool:       'forks',
		maxWorkers: 4,

		testTimeout: 200_000,
	},
});
