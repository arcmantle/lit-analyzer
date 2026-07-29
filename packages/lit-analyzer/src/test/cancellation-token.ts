import { DefaultLitAnalyzerContext } from '../lib/analyze/default-lit-analyzer-context.js';
import { compileFiles } from './helpers/compile-files.js';
import { getCurrentTsModule } from './helpers/ts-test.js';
import { tsTest } from './helpers/ts-test.js';

tsTest("setContextBase uses the handler's cancellation token when the handler provides one", t => {
	const { program, sourceFile } = compileFiles('html``');

	const context = new DefaultLitAnalyzerContext({
		ts:                   getCurrentTsModule(),
		getProgram:           () => program,
		getCancellationToken: () => ({ isCancellationRequested: () => true }),
	});

	context.setContextBase({ file: sourceFile });

	// Reflects the handler's token immediately -- not the 150ms wall-clock
	// fallback `MAX_RUNNING_TIME_PER_OPERATION` uses when no token is present.
	t.true(context.isCancellationRequested);
});

tsTest('setContextBase has no cancellation requested when the handler provides no token', t => {
	const { program, sourceFile } = compileFiles('html``');

	const context = new DefaultLitAnalyzerContext({
		ts:         getCurrentTsModule(),
		getProgram: () => program,
	});

	context.setContextBase({ file: sourceFile });

	t.is(context.isCancellationRequested, false);
});
