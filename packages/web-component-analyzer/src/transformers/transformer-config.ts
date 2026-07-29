import { VisibilityKind } from "../analyze/types/visibility-kind.js";

export interface TransformerConfig {
	cwd?: string;
	visibility?: VisibilityKind;
	markdown?: {
		titleLevel?: number; // deprecated
		headerLevel?: number;
	};
	inlineTypes?: boolean;
}
