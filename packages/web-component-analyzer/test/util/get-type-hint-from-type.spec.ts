import { toSimpleType } from 'ts-simple-type';
import { expect, test } from 'vitest';

import { getTypeHintFromType } from '../../src/util/get-type-hint-from-type.js';
import { TransformerConfig } from '../../src/transformers/transformer-config.js';
import { analyzeTextWithCurrentTsModule } from '../helpers/analyze-text-with-current-ts-module.js';

function hints(inlineTypes: boolean): Record<string, string | undefined> {
	const { results, program } = analyzeTextWithCurrentTsModule({
		fileName: 'test.ts',
		text:     `
			type Maybe<T> = T | undefined;
			type PlainUnion = number | undefined;
			interface Box<T> { value: T }

			class MyElement extends HTMLElement {
				maybe: Maybe<number> = undefined;
				plain: PlainUnion = undefined;
				box: Box<number> = { value: 1 };
			}
			customElements.define('my-element', MyElement);
		`,
	});

	const checker = program.getTypeChecker();
	const config = { inlineTypes } as TransformerConfig;
	const members = results[0].componentDefinitions[0].declaration!.members;

	return Object.fromEntries(members.map(member => [
		member.propName!,
		getTypeHintFromType(toSimpleType(member.type!(checker), checker), checker, config),
	]));
}

test('inlineTypes expands a generic union alias', () => {
	expect(hints(true).maybe).toBe('number | undefined');
});

test('inlineTypes expands a non-generic union alias', () => {
	expect(hints(true).plain).toBe('number | undefined');
});

test('inlineTypes keeps a generic interface', () => {
	expect(hints(true).box).toBe('Box<number>');
});

test('the default keeps the generic alias name', () => {
	const result = hints(false);
	expect(result.maybe).toBe('Maybe<number>');

	// `toSimpleType` discards the ALIAS node for a non-generic alias, see ISS_6JQKH45APT9NJVRN9563Q0Q6JR
	expect(result.plain).toBe('number | undefined');
});
