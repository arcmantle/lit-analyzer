import { Node, Type, TypeChecker } from 'typescript';

import { VisibilityKind } from '../visibility-kind.js';
import { ComponentFeatureBase } from './component-feature.js';


export interface ComponentEvent extends ComponentFeatureBase {
	name:        string;
	node:        Node;
	type?:       (checker: TypeChecker) => Type;
	typeHint?:   string;
	visibility?: VisibilityKind;
	deprecated?: boolean | string;
}
