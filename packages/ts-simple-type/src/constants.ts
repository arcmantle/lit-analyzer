import { Type } from 'typescript';

import { SimpleType, SimpleTypeNever, SimpleTypeUnknown } from './simple-type.js';

export const DEFAULT_TYPE_CACHE: WeakMap<Type, SimpleType> = new WeakMap();

export const DEFAULT_RESULT_CACHE: Map<string, WeakMap<SimpleType, WeakMap<SimpleType, boolean>>> = new Map();

export const DEFAULT_GENERIC_PARAMETER_TYPE: SimpleTypeUnknown = { kind: 'UNKNOWN' };

export const NEVER_TYPE: SimpleTypeNever = { kind: 'NEVER' };
