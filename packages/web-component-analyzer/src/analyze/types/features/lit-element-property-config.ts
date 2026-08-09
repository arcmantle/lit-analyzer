import { CallExpression, Node, type Type, type TypeChecker } from 'typescript';


export interface LitElementPropertyConfig {
	/** Resolves converter types with the caller's current TypeScript checker. */
	type?:      ((checker: TypeChecker) => Type) | string;
	attribute?: string | boolean;
	node?: {
		type?:      Node;
		attribute?: Node;
		decorator?: CallExpression;
	};
	hasConverter?: boolean;
	default?:      unknown;
	reflect?:      boolean;
	state?:        boolean;
}
