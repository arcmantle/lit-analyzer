import { Type } from 'typescript';

import { SimpleType, SimpleTypeAny, SimpleTypeNever } from './simple-type.js';

export const DEFAULT_TYPE_CACHE: WeakMap<Type, SimpleType> = new WeakMap();

export const DEFAULT_RESULT_CACHE: Map<string, WeakMap<SimpleType, WeakMap<SimpleType, boolean>>> = new Map();

export const NEVER_TYPE: SimpleTypeNever = { kind: 'NEVER' };

export const WILDCARD_TYPE: SimpleTypeAny = { kind: 'ANY' };
