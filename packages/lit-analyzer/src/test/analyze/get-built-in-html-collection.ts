import { getBuiltInHtmlCollection } from '../../lib/analyze/data/get-built-in-html-collection.js';
import { getCurrentTsModule, tsTest } from '../helpers/ts-test.js';

tsTest('creates checker-backed unions for built-in HTML metadata', t => {
	const ts = getCurrentTsModule();
	const checker = ts.createProgram([], {}).getTypeChecker();
	const collection = getBuiltInHtmlCollection();
	const input = collection.tags.find(tag => tag.tagName === 'input');
	const value = input?.properties.find(property => property.name === 'value');

	t.is(value == null ? undefined : checker.typeToString(value.getType(checker)), 'string | null');
});
