import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [ 'test/**/*.spec.ts' ],

		// Every assignment case builds a real TypeScript Program, and
		// `type-combinations.spec.ts` generates one case per type pair. Bound the
		// pool rather than scaling it to the CPU count, so the suite does not
		// exhaust memory on a developer machine.
		//
		// This must stay `maxWorkers`. Vitest 4 has no `poolOptions.forks.maxForks`,
		// and an unknown key here is ignored in silence -- which puts the pool back
		// to one worker per core.
		pool:       'forks',
		maxWorkers: 4,

		testTimeout: 200_000,
	},
});
