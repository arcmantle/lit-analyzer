import { expect, test } from 'vitest';

import { SimpleType, SimpleTypeAlias, SimpleTypeGenericArguments } from '../src/simple-type.js';
import { getGenericTarget } from '../src/utils/get-generic-target.js';

const stringType: SimpleType = { kind: 'STRING' };

test('An alias node reports the type it wraps', () => {
	const alias: SimpleTypeAlias = { kind: 'ALIAS', name: 'MyString', target: stringType };

	expect(getGenericTarget(alias)).toBe(stringType);
});

test('A generic arguments node reports the type it wraps', () => {
	const generic: SimpleTypeGenericArguments = { kind: 'GENERIC_ARGUMENTS', target: stringType, typeArguments: [] };

	expect(getGenericTarget(generic)).toBe(stringType);
});

test('A type that is not a generic wrapper reports no target', () => {
	expect(getGenericTarget(stringType)).toBeUndefined();
	expect(getGenericTarget({ kind: 'GENERIC_PARAMETER', name: 'T' })).toBeUndefined();
});
