import { CallExpression, Node, type Type } from 'typescript';


export interface LitElementPropertyConfig {
	type?:      Type | string;
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
