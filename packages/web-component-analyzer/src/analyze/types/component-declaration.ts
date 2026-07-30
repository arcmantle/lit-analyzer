import { Node, SourceFile, Symbol } from 'typescript';

import { ComponentCssPart } from './features/component-css-part.js';
import { ComponentCssProperty } from './features/component-css-property.js';
import { ComponentEvent } from './features/component-event.js';
import { ComponentMember } from './features/component-member.js';
import { ComponentMethod } from './features/component-method.js';
import { ComponentSlot } from './features/component-slot.js';
import { JsDoc } from './js-doc.js';

export interface ComponentFeatures {
	members:       ComponentMember[];
	methods:       ComponentMethod[];
	events:        ComponentEvent[];
	slots:         ComponentSlot[];
	cssProperties: ComponentCssProperty[];
	cssParts:      ComponentCssPart[];
}

export type ComponentHeritageClauseKind = 'implements' | 'extends' | 'mixin';

export interface ComponentHeritageClause {
	kind:        ComponentHeritageClauseKind;
	identifier:  Node;
	declaration: ComponentDeclaration | undefined;
}

export type ComponentDeclarationKind = 'mixin' | 'interface' | 'class';

export interface ComponentDeclaration extends ComponentFeatures {
	sourceFile:       SourceFile;
	node:             Node;
	declarationNodes: Set<Node>;

	kind:            ComponentDeclarationKind;
	jsDoc?:          JsDoc;
	symbol?:         Symbol;
	deprecated?:     boolean | string;
	heritageClauses: ComponentHeritageClause[];
}
