import { SourceFile } from 'typescript';
import { ComponentDeclaration, ComponentDefinition, visitAllHeritageClauses } from '@arcmantle/web-component-analyzer';

const CONTRIBUTING_FILES: WeakMap<ComponentDefinition, Set<SourceFile>> = new WeakMap();

/**
 * The files that gave a node to this definition: its own file, its declaration's file, and every
 * file in the heritage chain. A file it only takes a type from gives no node and is not one of them.
 *
 * Memoized on the definition, which is replaced whenever the component is rebuilt.
 */
export function getContributingFiles(definition: ComponentDefinition): ReadonlySet<SourceFile> {
	const cached = CONTRIBUTING_FILES.get(definition);
	if (cached != null)
		return cached;


	const files: Set<SourceFile> = new Set([ definition.sourceFile ]);

	if (definition.declaration != null) {
		files.add(definition.declaration.sourceFile);
		visitAllHeritageClauses(definition.declaration, clause => {
			if (clause.declaration != null)
				files.add(clause.declaration.sourceFile);
		});
	}

	CONTRIBUTING_FILES.set(definition, files);

	return files;
}

export function getDeclarationsInFile(definition: ComponentDefinition, sourceFile: SourceFile): ComponentDeclaration[] {
	const declarations: Set<ComponentDeclaration> = new Set();
	emitDeclarationsInFile(definition, sourceFile, decl => declarations.add(decl));

	return Array.from(declarations);
}

function emitDeclarationsInFile(
	definition: ComponentDefinition,
	sourceFile: SourceFile,
	emit: (decl: ComponentDeclaration) => unknown,
): void {
	const declaration = definition.declaration;

	if (declaration == null)
		return;


	if (declaration.sourceFile.fileName === sourceFile.fileName) {
		if (emit(declaration) === false)
			return;
	}

	visitAllHeritageClauses(declaration, clause => {
		if (clause.declaration && clause.declaration.sourceFile === sourceFile) {
			if (emit(clause.declaration) === false)
				return;
		}
	});
}
