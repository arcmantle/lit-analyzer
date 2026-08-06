import { Type } from 'typescript';

import { getUserConfigHtmlCollection } from '../../lib/analyze/data/get-user-config-html-collection.js';
import { makeConfig } from '../../lib/analyze/lit-analyzer-config.js';
import { compileFiles } from '../helpers/compile-files.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('creates checker any types for configured global attributes and events', t => {
	const { program } = compileFiles({
		fileName: 'source.ts',
		text:     '',
		entry:    true,
	});
	const checker = program.getTypeChecker();
	const collection = getUserConfigHtmlCollection(makeConfig({
		globalAttributes: [ 'data-test' ],
		globalEvents:     [ 'change' ],
	}), checker);
	const attribute = collection.global.attributes![0];
	const event = collection.global.events![0];

	t.is(checker.typeToString(attribute.getType(checker) as Type), 'any');
	t.is(checker.typeToString(event.getType(checker) as Type), 'any');
});

tsTest('creates configured global types from the checker supplied by the caller', t => {
	const { program: sourceProgram } = compileFiles({ fileName: 'source.ts', text: '', entry: true });
	const { program: currentProgram } = compileFiles({ fileName: 'current.ts', text: '', entry: true });
	const collection = getUserConfigHtmlCollection(
		makeConfig({ globalAttributes: [ 'data-test' ] }),
		sourceProgram.getTypeChecker(),
	);
	const currentChecker = currentProgram.getTypeChecker();

	t.is(collection.global.attributes![0].getType(currentChecker), currentChecker.getAnyType());
});
