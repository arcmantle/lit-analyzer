import { Type, TypeChecker, TypeFormatFlags } from 'typescript';

import { TransformerConfig } from '../transformers/transformer-config.js';

/**
 * Returns a "type hint" from a type
 * The type hint is an easy to read representation of the type and is not made for being parsed.
 * @param type
 * @param checker
 * @param config
 */
export function getTypeHintFromType(
	type: string | Type | undefined,
	checker: TypeChecker,
	config: TransformerConfig,
): string | undefined {
	if (type == null)
		return undefined;
	if (typeof type === 'string')
		return type;

	const expandAlias = config.inlineTypes ||
		(type.aliasSymbol != null && type.aliasTypeArguments == null && type.isUnion());
	const typeHint = checker.typeToString(type, undefined, expandAlias ? TypeFormatFlags.InTypeAlias : undefined);

	// Replace "anys" and "{}" with more human friendly representations
	if (typeHint === 'any')
		return undefined;
	if (typeHint === 'any[]')
		return 'array';
	if (typeHint === '{}')
		return 'object';

	// "CustomEvent<unknown>" and "Event" of no interest
	if (typeHint === 'CustomEvent<unknown>' || typeHint === 'Event')
		return undefined;

	return typeHint;
}
