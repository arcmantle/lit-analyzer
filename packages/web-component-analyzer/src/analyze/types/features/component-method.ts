import { SimpleType } from 'ts-simple-type';
import { Node, Type, TypeChecker } from 'typescript';

import { VisibilityKind } from '../visibility-kind.js';
import { ComponentFeatureBase } from './component-feature.js';

export interface ComponentMethod extends ComponentFeatureBase {
	name:  string;
	node?: Node;
	type?: (checker: TypeChecker) => SimpleType | Type;

	visibility?: VisibilityKind;
	//modifiers?: Set<ModifierKind>;
}
