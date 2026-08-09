import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { afterEach, describe, expect, test } from 'vitest';
import type { ComponentDeclaration, ComponentDefinition, ComponentMember } from '@arcmantle/web-component-analyzer';

import { convertComponentDeclarationToHtmlTag } from '../../lib/analyze/parse/convert-component-definitions-to-html-collection.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		fs.rmSync(directory, { recursive: true, force: true });
});

describe('Lit attribute names from external declaration maps', () => {
	test('uses the configured attribute name instead of the property name', () => {
		const tag = convertMappedComponent("attribute: 'renamed-value'");

		expect(tag.attributes.map(attribute => attribute.name)).toEqual([ 'renamed-value' ]);
		expect(tag.properties.map(property => property.name)).toEqual([ 'propertyName' ]);
	});

	test('does not synthesize an attribute when the decorator disables it', () => {
		const tag = convertMappedComponent('attribute: false');

		expect(tag.attributes).toEqual([]);
		expect(tag.properties.map(property => property.name)).toEqual([ 'propertyName' ]);
	});
});

function convertMappedComponent(attributeOption: string) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lit-attribute-map-'));
	temporaryDirectories.push(directory);

	const sourceFileName = path.join(directory, 'component.ts');
	const outputDirectory = path.join(directory, 'dist');
	const sourceText = `declare function property(options: object): PropertyDecorator;
export class TestElement extends HTMLElement {
	@property({ ${ attributeOption } }) propertyName?: string;
}
`;
	fs.writeFileSync(sourceFileName, sourceText);

	const emitProgram = ts.createProgram([ sourceFileName ], {
		target:                 ts.ScriptTarget.ESNext,
		module:                 ts.ModuleKind.ESNext,
		declaration:            true,
		declarationMap:         true,
		emitDeclarationOnly:    true,
		experimentalDecorators: true,
		outDir:                 outputDirectory,
	});
	emitProgram.emit();

	const declarationFileName = path.join(outputDirectory, 'component.d.ts');
	const program = ts.createProgram([ declarationFileName ], {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
	});
	const declarationSourceFile = ts.createSourceFile(
		declarationFileName,
		fs.readFileSync(declarationFileName, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
	const declarationClass = declarationSourceFile.statements.find(ts.isClassDeclaration)!;
	const declarationProperty = declarationClass.members.find(ts.isPropertyDeclaration)!;

	const member = {
		kind:     'property',
		propName: 'propertyName',
		attrName: undefined,
		node:     declarationProperty,
		type:     checker => checker.getStringType(),
	} satisfies ComponentMember;
	const declaration = {
		sourceFile:       declarationSourceFile,
		node:             declarationClass,
		declarationNodes: new Set([ declarationClass ]),
		kind:             'class',
		heritageClauses:  [],
		members:          [ member ],
		methods:          [],
		events:           [],
		slots:            [],
		cssProperties:    [],
		cssParts:         [],
	} satisfies ComponentDeclaration;
	const definition = {
		tagName:         'test-element',
		tagNameNodes:    new Set(),
		identifierNodes: new Set(),
		declaration,
		sourceFile:      declarationSourceFile,
	} satisfies ComponentDefinition;

	return convertComponentDeclarationToHtmlTag(declaration, definition, {
		addDeclarationPropertiesAsAttributes: true,
		program,
		ts,
	});
}
