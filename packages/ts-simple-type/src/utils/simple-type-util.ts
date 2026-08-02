import {
	isSimpleTypeLiteral,
	PRIMITIVE_TYPE_KINDS,
	SimpleType,
	SimpleTypeBooleanLiteral,
	SimpleTypeGenericArguments,
	SimpleTypeNull,
	SimpleTypeNumberLiteral,
	SimpleTypeTuple,
	SimpleTypeUndefined,
} from '../simple-type.js';
import { getGenericParameterKey } from './get-generic-parameter-key.js';
import { getGenericTarget } from './get-generic-target.js';
import { resolveType } from './resolve-type.js';

/**
 * Returns a type that represents the length of the Tuple type
 * Read more here: https://github.com/microsoft/TypeScript/pull/24897
 * @param tuple
 */
export function getTupleLengthType(tuple: SimpleTypeTuple): SimpleType {
	// When the tuple has rest argument, return "number"
	if (tuple.rest) {
		return {
			kind: 'NUMBER',
		};
	}

	// Else return an intersection of number literals that represents all possible lengths
	const minLength = tuple.members.filter(member => !member.optional).length;

	if (minLength === tuple.members.length) {
		return {
			kind:  'NUMBER_LITERAL',
			value: minLength,
		};
	}

	return {
		kind:  'UNION',
		types: new Array(tuple.members.length - minLength + 1).fill(0).map(
			(_, i) =>
				({
					kind:  'NUMBER_LITERAL',
					value: minLength + i,
				} as SimpleTypeNumberLiteral),
		),
	};
}

export function simplifySimpleTypes(types: SimpleType[]): SimpleType[] {
	let newTypes: SimpleType[] = [ ...types ];
	const NULLABLE_TYPE_KINDS = [ 'UNDEFINED', 'NULL' ];

	// Only include one instance of primitives and literals
	newTypes = newTypes.filter((type, i) => {
		// Only include one of each literal with specific value
		if (isSimpleTypeLiteral(type))
			return !newTypes.slice(0, i).some(newType => newType.kind === type.kind && newType.value === type.value);


		if (PRIMITIVE_TYPE_KINDS.includes(type.kind) || NULLABLE_TYPE_KINDS.includes(type.kind)) {
			// Remove this type from the array if there is already a primitive in the array
			return !newTypes.slice(0, i).some(t => t.kind === type.kind);
		}

		return true;
	});

	// Simplify boolean literals
	const booleanLiteralTypes = newTypes.filter((t): t is SimpleTypeBooleanLiteral => t.kind === 'BOOLEAN_LITERAL');
	if (booleanLiteralTypes.find(t => t.value === true) != null && booleanLiteralTypes.find(t => t.value === false) != null)
		newTypes = [ ...newTypes.filter(type => type.kind !== 'BOOLEAN_LITERAL'), { kind: 'BOOLEAN' } ];


	// Reorder "NULL" and "UNDEFINED" to be last
	const nullableTypes = newTypes.filter((t): t is SimpleTypeUndefined | SimpleTypeNull => NULLABLE_TYPE_KINDS.includes(t.kind));
	if (nullableTypes.length > 0) {
		newTypes = [
			...newTypes.filter(t => !NULLABLE_TYPE_KINDS.includes(t.kind)),
			...nullableTypes.sort((t1, t2) => (t1.kind === 'NULL' ? (t2.kind === 'UNDEFINED' ? -1 : 0) : t2.kind === 'NULL' ? 1 : 0)),
		];
	}

	return newTypes;
}

/**
 * Returns a partial map. A parameter with neither an argument nor a default gets no entry, which keeps it free
 * so that `resolveGenericParameter` decides it by position.
 */
export function extendTypeParameterMap(genericType: SimpleTypeGenericArguments, existingMap: Map<string, SimpleType>) {
	const target = resolveType(getGenericTarget(genericType), existingMap);

	if ('typeParameters' in target) {
		const parameterEntries = (target.typeParameters || []).flatMap((parameter, i) => {
			const typeArg = genericType.typeArguments[i];

			// A default answers "the caller omitted the argument", so it applies here, at instantiation.
			// With neither an argument nor a default the parameter stays free, so it gets no entry and
			// `resolveGenericParameter` decides it by position.
			if (typeArg == null && parameter.default == null)
				return [];


			const resolvedTypeArg = typeArg == null
				? parameter.default!
				: resolveType(typeArg, existingMap);

			return [ [ getGenericParameterKey(parameter), resolvedTypeArg ] as [string, SimpleType] ];
		});
		const allParameterEntries = [ ...existingMap.entries(), ...parameterEntries ];

		return new Map(allParameterEntries);
	}

	return existingMap;
}
