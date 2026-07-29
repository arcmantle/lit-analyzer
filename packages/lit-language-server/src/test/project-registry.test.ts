import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { createProjectRegistry, type ProjectRegistryHost } from '../project-registry.js';

const fixturesDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const multiProjectDir = path.join(fixturesDir, 'multi-project');
const projectADir = path.join(multiProjectDir, 'project-a');
const projectBDir = path.join(multiProjectDir, 'project-b');
const aTsconfig = path.join(projectADir, 'tsconfig.json');
const bTsconfig = path.join(projectBDir, 'tsconfig.json');

function createTestHost(): ProjectRegistryHost & { logMessages: string[]; errorMessages: string[]; } {
	const logMessages: string[] = [];
	const errorMessages: string[] = [];

	return {
		logMessages,
		errorMessages,
		log:               message => logMessages.push(message),
		logError:          message => errorMessages.push(message),
		onTsconfigChanged: () => {},
	};
}

describe('createProjectRegistry', () => {
	test('falls back to an inferred project for a file with no tsconfig.json anywhere above it', () => {
		const registry = createProjectRegistry(createTestHost());

		// Outside the repo entirely -- a path inside it would always
		// eventually walk up into this monorepo's own tsconfig.json.
		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-no-tsconfig-'));
		try {
			const fileName = path.join(outsideDir, 'standalone.ts');
			fs.writeFileSync(fileName, 'export const value = 1;');

			const project = registry.getOrCreateProject(fileName);

			expect(project).toBeDefined();
			expect(project?.tsconfigPath).toBe(fileName);
		}
		finally {
			fs.rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	test('reuses the same inferred project for further requests for the same file', () => {
		const registry = createProjectRegistry(createTestHost());

		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-no-tsconfig-'));
		try {
			const fileName = path.join(outsideDir, 'standalone.ts');
			fs.writeFileSync(fileName, 'export const value = 1;');

			const first = registry.getOrCreateProject(fileName);
			const second = registry.getOrCreateProject(fileName);

			expect(second).toBe(first);
		}
		finally {
			fs.rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	test('releaseUnreferencedProjects drops an inferred project once its file is no longer open', () => {
		const host = createTestHost();
		const registry = createProjectRegistry(host);

		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-no-tsconfig-'));
		try {
			const fileName = path.join(outsideDir, 'standalone.ts');
			fs.writeFileSync(fileName, 'export const value = 1;');

			const before = registry.getOrCreateProject(fileName);
			registry.releaseUnreferencedProjects([]);

			expect(host.logMessages).toContainEqual(expect.stringContaining(`released the inferred project for ${ fileName }`));

			const after = registry.getOrCreateProject(fileName);
			expect(after).toBeDefined();
			expect(after).not.toBe(before);
		}
		finally {
			fs.rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	test(
		'a file resolves to the real project once a tsconfig.json appears above it, dropping the earlier inferred '
		+ 'project',
		() => {
			const host = createTestHost();
			const registry = createProjectRegistry(host);

			const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-registry-no-tsconfig-'));
			try {
				const fileName = path.join(outsideDir, 'standalone.ts');
				fs.writeFileSync(fileName, 'export const value = 1;');

				const inferred = registry.getOrCreateProject(fileName);
				expect(inferred?.tsconfigPath).toBe(fileName);

				// A tsconfig.json now appears above the file, so it belongs to a
				// real project from here on.
				fs.writeFileSync(path.join(outsideDir, 'tsconfig.json'), '{}');
				const real = registry.getOrCreateProject(fileName);

				expect(real?.tsconfigPath).toBe(path.join(outsideDir, 'tsconfig.json'));

				// The file is closed. If the earlier inferred project were still
				// held onto, closing would log its release a second time; it must
				// have already been dropped the moment the real project took over.
				registry.releaseUnreferencedProjects([]);
				expect(host.logMessages.filter(message => message.includes('released the inferred project for'))).toHaveLength(0);
			}
			finally {
				fs.rmSync(outsideDir, { recursive: true, force: true });
			}
		},
	);

	test('boots one project per distinct tsconfig, and reuses it for further files under the same one', () => {
		const registry = createProjectRegistry(createTestHost());

		const first = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		const second = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));

		expect(first).toBeDefined();
		expect(second).toBe(first);
	});

	test('boots separate, independent projects for files under different tsconfigs', () => {
		const registry = createProjectRegistry(createTestHost());

		const projectA = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		const projectB = registry.getOrCreateProject(path.join(projectBDir, 'b.ts'));

		expect(projectA?.tsconfigPath).toBe(aTsconfig);
		expect(projectB?.tsconfigPath).toBe(bTsconfig);
		expect(projectA).not.toBe(projectB);
	});

	test("a file listed by two projects' tsconfig still resolves to its own nearest tsconfig", () => {
		const registry = createProjectRegistry(createTestHost());

		// Boots project-a first, whose own tsconfig also lists shared.ts.
		registry.getOrCreateProject(path.join(projectADir, 'a.ts'));

		const sharedProject = registry.getOrCreateProject(path.join(projectBDir, 'shared.ts'));

		expect(sharedProject?.tsconfigPath).toBe(bTsconfig);
	});

	test('releaseUnreferencedProjects drops a project no open file resolves to any more, and keeps the rest', () => {
		const host = createTestHost();
		const registry = createProjectRegistry(host);

		registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		registry.getOrCreateProject(path.join(projectBDir, 'b.ts'));

		// Only project-b's file is still open.
		registry.releaseUnreferencedProjects([ path.join(projectBDir, 'b.ts') ]);

		expect(host.logMessages).toContainEqual(expect.stringContaining(`released the project at ${ aTsconfig }`));

		// project-a is gone: asking for it again boots a fresh instance.
		const rebootedProjectA = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		const stillProjectB = registry.getOrCreateProject(path.join(projectBDir, 'b.ts'));

		expect(rebootedProjectA).toBeDefined();
		expect(stillProjectB?.tsconfigPath).toBe(bTsconfig);
	});

	test('releaseUnreferencedProjects keeps every project still referenced by an open file', () => {
		const host = createTestHost();
		const registry = createProjectRegistry(host);

		const projectA = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		registry.releaseUnreferencedProjects([ path.join(projectADir, 'a.ts') ]);

		expect(host.logMessages.some(message => message.includes('released the project'))).toBe(false);
		expect(registry.getOrCreateProject(path.join(projectADir, 'a.ts'))).toBe(projectA);
	});

	test('rebuildProject replaces a registered project in place', () => {
		const registry = createProjectRegistry(createTestHost());

		const before = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		registry.rebuildProject(aTsconfig);
		const after = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));

		expect(after).toBeDefined();
		expect(after).not.toBe(before);
	});

	test('rebuildProject keeps the previous project when rebuilding fails', () => {
		const host = createTestHost();
		const registry = createProjectRegistry(host);

		const before = registry.getOrCreateProject(path.join(projectADir, 'a.ts'));
		// Not a registered project's tsconfig, so bootProject fails to read it.
		registry.rebuildProject(path.join(fixturesDir, 'does-not-exist', 'tsconfig.json'));

		expect(host.errorMessages.some(message => message.includes('could not boot the analysis compiler'))).toBe(true);
		expect(registry.getOrCreateProject(path.join(projectADir, 'a.ts'))).toBe(before);
	});

	test('hasProject reports whether a project is already registered for a tsconfig, without booting one', () => {
		const registry = createProjectRegistry(createTestHost());

		expect(registry.hasProject(aTsconfig)).toBe(false);

		registry.getOrCreateProject(path.join(projectADir, 'a.ts'));

		expect(registry.hasProject(aTsconfig)).toBe(true);
		expect(registry.hasProject(bTsconfig)).toBe(false);
	});
});
