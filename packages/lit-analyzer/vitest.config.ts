import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Run the TypeScript sources directly. Nothing here reads build output, so
		// the suite no longer needs a build to run first.
		include: [ 'src/test/**/*.ts' ],
		exclude: [ 'src/test/helpers/**' ],

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
