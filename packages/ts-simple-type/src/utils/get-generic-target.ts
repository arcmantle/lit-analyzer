import { SimpleType, SimpleTypeAlias, SimpleTypeGenericArguments } from '../simple-type.js';

/**
 * Returns the type that a generic wrapper node wraps.
 *
 * An `ALIAS` node and a `GENERIC_ARGUMENTS` node both wrap one other type. Every
 * read of that wrapped type goes through this accessor, so the wrapper shape has
 * one place to change.
 *
 * Returns `undefined` for a type that is not a generic wrapper.
 */
export function getGenericTarget(type: SimpleTypeAlias | SimpleTypeGenericArguments): SimpleType;
export function getGenericTarget(type: SimpleType): SimpleType | undefined;
export function getGenericTarget(type: SimpleType): SimpleType | undefined {
	switch (type.kind) {
	case 'ALIAS':
	case 'GENERIC_ARGUMENTS':
		return type.target;
	default:
		return undefined;
	}
}
