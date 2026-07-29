import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createDebouncedRunner } from '../debounced-runner.js';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createDebouncedRunner', () => {
	test('collapses several schedule() calls within the delay into a single run', () => {
		const run = vi.fn();
		const runner = createDebouncedRunner(300, run);

		runner.schedule();
		runner.schedule();
		runner.schedule();

		vi.advanceTimersByTime(300);

		expect(run).toHaveBeenCalledTimes(1);
	});

	test('does not run before the delay elapses', () => {
		const run = vi.fn();
		const runner = createDebouncedRunner(300, run);

		runner.schedule();
		vi.advanceTimersByTime(299);

		expect(run).not.toHaveBeenCalled();
	});

	test("a schedule() call while a run is in flight cancels that run's token", async () => {
		let resolveFirstRun: () => void = () => {};
		const firstRunToken = { current: undefined as unknown as { isCancellationRequested(): boolean; } };
		const run = vi
			.fn()
			.mockImplementationOnce((token: { isCancellationRequested(): boolean; }) => {
				firstRunToken.current = token;

				return new Promise<void>(resolve => {
					resolveFirstRun = resolve;
				});
			})
			.mockImplementation(() => undefined);
		const runner = createDebouncedRunner(300, run);

		runner.schedule();
		vi.advanceTimersByTime(300);
		expect(run).toHaveBeenCalledTimes(1);
		expect(firstRunToken.current.isCancellationRequested()).toBe(false);

		// A new change arrives while the first run is still in flight.
		runner.schedule();
		expect(firstRunToken.current.isCancellationRequested()).toBe(true);

		resolveFirstRun();
		await Promise.resolve();
	});

	test('a run superseded while in flight is followed by a fresh, uncancelled run', async () => {
		let resolveFirstRun: () => void = () => {};
		const tokens: { isCancellationRequested(): boolean; }[] = [];
		const run = vi
			.fn()
			.mockImplementationOnce((token: { isCancellationRequested(): boolean; }) => {
				tokens.push(token);

				return new Promise<void>(resolve => {
					resolveFirstRun = resolve;
				});
			})
			.mockImplementation((token: { isCancellationRequested(): boolean; }) => {
				tokens.push(token);
			});
		const runner = createDebouncedRunner(300, run);

		runner.schedule();
		vi.advanceTimersByTime(300);

		runner.schedule();
		resolveFirstRun();
		await Promise.resolve();

		vi.advanceTimersByTime(300);

		expect(run).toHaveBeenCalledTimes(2);
		expect(tokens[1].isCancellationRequested()).toBe(false);
	});
});
