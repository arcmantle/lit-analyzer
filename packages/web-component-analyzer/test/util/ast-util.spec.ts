import * as ts from 'typescript';

import { analyzeText } from '../../src/analyze/analyze-text.js';
import { isPropertyRequired, findChildren } from '../../src/analyze/util/ast-util.js';
import { tsTest } from '../helpers/ts-test.js';

tsTest('isPropertyRequired rejects properties typed as any', t => {
	const { analyzedSourceFiles: [ sourceFile ], program } = analyzeText('class Example { value: any; }');
	let property: ts.PropertyDeclaration | undefined;
	findChildren(sourceFile, ts.isPropertyDeclaration, node => property = node);

	if (property == null) {
		t.fail('Expected to find value property in class');
		return;
	}

	t.is(isPropertyRequired(property, program.getTypeChecker(), ts), false);
});

tsTest('isPropertyRequired rejects nullable properties', t => {
	const { analyzedSourceFiles: [ sourceFile ], program } = analyzeText('class Example { value: string | undefined; other: string | null; }');
	const properties: ts.PropertyDeclaration[] = [];
	findChildren(sourceFile, ts.isPropertyDeclaration, property => properties.push(property));

	const checker = program.getTypeChecker();
	t.is(isPropertyRequired(properties[0], checker, ts), false);
	t.is(isPropertyRequired(properties[1], checker, ts), false);
});

tsTest('isPropertyRequired accepts non-nullable properties', t => {
	const { analyzedSourceFiles: [ sourceFile ], program } = analyzeText('class Example { value: string; count: number; }');
	const properties: ts.PropertyDeclaration[] = [];
	findChildren(sourceFile, ts.isPropertyDeclaration, property => properties.push(property));

	const checker = program.getTypeChecker();
	t.is(isPropertyRequired(properties[0], checker, ts), true);
	t.is(isPropertyRequired(properties[1], checker, ts), true);
});