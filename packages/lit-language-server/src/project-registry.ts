import * as fs from 'node:fs';
import * as path from 'node:path';

import type { HostCancellationToken } from 'typescript';

import { type AnalysisCompiler, createAnalysisCompiler, createInferredAnalysisCompiler } from './analysis-compiler.js';
import { createLitAnalyzer, type LitAnalyzerHandle } from './analyzer.js';
import { findNearestTsconfig } from './tsconfig-file.js';

/** A single TypeScript project's analysis compiler and the `LitAnalyzer` wired to it. */
export interface Project {
	/**
	 * The tsconfig this project was booted from, or the standalone file's own
	 * path when there is no tsconfig anywhere above it -- one inferred
	 * project exists per such file, so this still identifies the project
	 * uniquely either way.
	 */
	readonly tsconfigPath:      string;
	readonly compiler:          AnalysisCompiler;
	readonly litAnalyzerHandle: LitAnalyzerHandle;
}

interface TrackedProject extends Project {
	watcher: fs.FSWatcher | undefined;
}

export interface ProjectRegistry {
	/**
	 * Finds (booting it if this is the first time it's been seen) the
	 * project that owns `fileName`: the nearest `tsconfig.json` walking up
	 * from its directory, the same "nearest wins" rule `findNearestTsconfig`
	 * already uses on its own. Falls back to an inferred project holding just
	 * `fileName` when no `tsconfig.json` exists anywhere above it -- mirrors
	 * what tsserver calls an inferred project, so a loose file still gets
	 * useful diagnostics instead of none at all. Only returns `undefined` if
	 * booting that inferred project itself fails.
	 *
	 * A file two projects' tsconfigs both list (e.g. one project's `include`
	 * reaches into another project's directory) still resolves to exactly
	 * one project every time: whichever tsconfig is nearest to the file on
	 * disk, never whichever project happened to reference or boot it first.
	 */
	getOrCreateProject(fileName: string): Project | undefined;

	/**
	 * Boots (if not already registered) the project at an already-known
	 * `tsconfigPath`, without searching for it. Used at startup, when the
	 * client's root resolves to a tsconfig before any document has opened.
	 */
	ensureProject(tsconfigPath: string): Project | undefined;

	/**
	 * Rebuilds the project already registered at `tsconfigPath` in place,
	 * e.g. because the tsconfig itself changed. A no-op (beyond logging) if
	 * rebuilding fails -- the previous, working project is left in place, the
	 * same "keep the last working state" behaviour the single-project server
	 * had before this registry existed.
	 *
	 * Previously open documents are not carried over into the rebuilt
	 * compiler: the caller's next re-analysis reports them against disk
	 * content, the same as closing an unsaved document already does.
	 */
	rebuildProject(tsconfigPath: string): void;

	/**
	 * Whether a project is already registered at exactly `tsconfigPath` --
	 * lets a caller (e.g. a file watcher handler) decide whether there's
	 * anything to rebuild at all, without booting one that was never
	 * referenced by an open document in the first place.
	 */
	hasProject(tsconfigPath: string): boolean;

	/**
	 * Closes and drops every registered project whose tsconfig no longer
	 * owns any file in `openFileNames` -- mirrors the "still referenced"
	 * recompute `config-file.ts` watching already does for
	 * `lit-analyzer.config.json`. Also drops any inferred project (see
	 * `getOrCreateProject`) whose one file is no longer in `openFileNames`.
	 * Called after a document closes, since that's the only event that can
	 * make a previously-referenced project unreferenced.
	 */
	releaseUnreferencedProjects(openFileNames: Iterable<string>): void;
}

export interface ProjectRegistryHost {
	log(message: string): void;
	logError(message: string): void;
	/** Read fresh on every analysis run; see `createLitAnalyzer`'s own parameter. */
	getCancellationToken?: () => HostCancellationToken;
	/** Called whenever a registered project's tsconfig changes on disk. */
	onTsconfigChanged(tsconfigPath: string): void;
}

/**
 * Holds one analysis compiler and `LitAnalyzer` per `tsconfig.json`
 * discovered so far, so a workspace with more than one TypeScript project
 * gets correct, isolated results in every one: two projects, each with their
 * own root files and compiler options, never share a `Program`.
 */
export function createProjectRegistry(host: ProjectRegistryHost): ProjectRegistry {
	const projects: Map<string, TrackedProject> = new Map();
	// One inferred project per standalone file with no tsconfig.json above
	// it -- keyed by the file's own path, since that's the only thing that
	// identifies it. No `watcher`: there's no tsconfig to watch.
	const inferredProjects: Map<string, Project> = new Map();

	function bootProject(tsconfigPath: string): TrackedProject | undefined {
		try {
			const compiler = createAnalysisCompiler(tsconfigPath, host.log);
			const litAnalyzerHandle = createLitAnalyzer(compiler, host.getCancellationToken, host.log);
			host.log(`lit-language-server sees ${ compiler.getRootFileNames().length } source file(s) via ${ tsconfigPath }`);

			return { tsconfigPath, compiler, litAnalyzerHandle, watcher: undefined };
		}
		catch (error) {
			host.logError(
				`lit-language-server could not boot the analysis compiler for ${ tsconfigPath }: ${ (error as Error).message }`,
			);

			return undefined;
		}
	}

	/**
	 * Boots an inferred project (see `getOrCreateProject`) for a standalone
	 * file with no tsconfig.json anywhere above it. A boot failure here is
	 * logged and otherwise ignored, the same "log and move on" treatment
	 * `bootProject` gives a broken tsconfig, so one unanalyzable file can't
	 * take down the rest of the workspace.
	 */
	function bootInferredProject(fileName: string): Project | undefined {
		try {
			const compiler = createInferredAnalysisCompiler(fileName, host.log);
			const litAnalyzerHandle = createLitAnalyzer(compiler, host.getCancellationToken, host.log);
			host.log(`lit-language-server found no tsconfig.json above ${ fileName }; using an inferred project for just this file`);

			return { tsconfigPath: fileName, compiler, litAnalyzerHandle };
		}
		catch (error) {
			host.logError(`lit-language-server could not boot an inferred project for ${ fileName }: ${ (error as Error).message }`);

			return undefined;
		}
	}

	function ensureInferredProject(fileName: string): Project | undefined {
		const existing = inferredProjects.get(fileName);
		if (existing != null)
			return existing;


		const project = bootInferredProject(fileName);
		if (project != null)
			inferredProjects.set(fileName, project);

		return project;
	}

	function watchTsconfig(project: TrackedProject): void {
		try {
			project.watcher = fs.watch(project.tsconfigPath, () => host.onTsconfigChanged(project.tsconfigPath));
		}
		catch (error) {
			host.logError(`lit-language-server could not watch ${ project.tsconfigPath }: ${ (error as Error).message }`);
		}
	}

	function ensureProject(tsconfigPath: string): Project | undefined {
		const existing = projects.get(tsconfigPath);
		if (existing != null)
			return existing;


		const project = bootProject(tsconfigPath);
		if (project == null)
			return undefined;


		watchTsconfig(project);
		projects.set(tsconfigPath, project);

		return project;
	}

	return {
		getOrCreateProject(fileName: string): Project | undefined {
			const tsconfigPath = findNearestTsconfig(path.dirname(fileName));
			if (tsconfigPath == null)
				return ensureInferredProject(fileName);


			// A tsconfig may have appeared above this file since the last time
			// it was requested (e.g. one was just created); drop any stale
			// inferred project for it so it isn't kept alive forever once this
			// file never resolves to "no tsconfig" again.
			inferredProjects.delete(fileName);

			return ensureProject(tsconfigPath);
		},

		ensureProject,

		rebuildProject(tsconfigPath: string): void {
			const previous = projects.get(tsconfigPath);
			const project = bootProject(tsconfigPath);
			if (project == null) {
				// bootProject already logged its own error; say so here too,
				// otherwise the diagnostics that follow silently look like
				// they reflect the edit just made.
				host.logError(
					`lit-language-server could not rebuild the project from ${ tsconfigPath }; diagnostics still reflect \
the previous, working tsconfig`,
				);

				return;
			}

			watchTsconfig(project);
			projects.set(tsconfigPath, project);
			previous?.watcher?.close();
		},

		hasProject(tsconfigPath: string): boolean {
			return projects.has(tsconfigPath);
		},

		releaseUnreferencedProjects(openFileNames: Iterable<string>): void {
			const openFileNameSet = new Set(openFileNames);
			const stillReferenced: Set<string> = new Set();
			for (const fileName of openFileNameSet) {
				const tsconfigPath = findNearestTsconfig(path.dirname(fileName));
				if (tsconfigPath != null)
					stillReferenced.add(tsconfigPath);
			}

			for (const [ tsconfigPath, project ] of projects) {
				if (!stillReferenced.has(tsconfigPath)) {
					project.watcher?.close();
					projects.delete(tsconfigPath);
					host.log(`lit-language-server released the project at ${ tsconfigPath } (no open document uses it)`);
				}
			}

			// An inferred project's only file is its key, so it's unreferenced
			// the moment that exact file is no longer open -- there's no
			// tsconfig `include`/`exclude` to recheck the way there is above.
			for (const fileName of inferredProjects.keys()) {
				if (!openFileNameSet.has(fileName)) {
					inferredProjects.delete(fileName);
					host.log(`lit-language-server released the inferred project for ${ fileName } (no open document uses it)`);
				}
			}
		},
	};
}
