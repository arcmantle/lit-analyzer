import { SimpleTypeGenericParameter } from '../simple-type.js';

/**
 * The key of a parameter in the generic parameter map.
 *
 * A parameter built from source text carries the identity of its declaration, so two parameters
 * with the same name from different declarations get different keys. A hand-built parameter has no
 * identity, so it keeps its name as the key.
 */
export function getGenericParameterKey(parameter: SimpleTypeGenericParameter): string {
	return parameter.id ?? parameter.name;
}
