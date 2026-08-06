import { HtmlDataSourceKind, HtmlDataSourceMerged } from '../../lib/analyze/store/html-store/html-data-source-merged.js';
import { getCurrentTsModule, tsTest } from '../helpers/ts-test.js';

tsTest('merges related HTML property types through the current checker', t => {
	const ts = getCurrentTsModule();
	const program = ts.createProgram([], {});
	const checker = program.getTypeChecker();
	const store = new HtmlDataSourceMerged();

	store.absorbCollection({
		tags: [
			{
				tagName:    'input',
				attributes: [],
				properties: [
					{
						name:    'value',
						kind:    'property',
						getType: currentChecker => currentChecker.getStringType(),
					},
				],
				events:        [],
				slots:         [],
				cssParts:      [],
				cssProperties: [],
			},
		],
		global: {},
	}, HtmlDataSourceKind.DECLARED);
	store.absorbSubclassExtension('HTMLElement', {
		tagName:    'HTMLElement',
		attributes: [],
		properties: [
			{
				name:    'value',
				kind:    'property',
				getType: currentChecker => currentChecker.getNumberType(),
			},
		],
		events:        [],
		slots:         [],
		cssParts:      [],
		cssProperties: [],
	});

	const type = store.getAllPropertiesForTag('input').get('value')?.getType(checker);

	t.is(type == null ? undefined : checker.typeToString(type), 'string | number');
});
