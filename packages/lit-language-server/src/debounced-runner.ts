/**
 * A cancellation token for a single run started by a `DebouncedRunner`.
 * `isCancellationRequested()` flips to `true` once a later `schedule()` call
 * supersedes this run, so a long-running analysis can check it between steps
 * and stop early instead of finishing wastefully.
 */
export interface CancellationToken {
	isCancellationRequested(): boolean;
}

export interface DebouncedRunner {
	/**
	 * (Re)starts the debounce delay. A call before the previous delay
	 * elapsed discards that pending run -- only one run happens per burst of
	 * calls. A call while a run from an earlier `schedule()` is still in
	 * flight (its `run` promise hasn't resolved yet) cancels that run's
	 * token, so it can stop early instead of continuing to do now-stale work.
	 */
	schedule(): void;
}

/**
 * Debounces calls to `run` by `delayMs`, and cancels a run already in flight
 * when a new `schedule()` call supersedes it -- so fast typing produces one
 * analysis run for the final state, not a backlog of one run per keystroke.
 */
export function createDebouncedRunner(delayMs: number, run: (token: CancellationToken) => void | Promise<void>): DebouncedRunner {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let activeRun: { cancelled: boolean; } | undefined;

	function schedule(): void {
		if (timer != null)
			clearTimeout(timer);


		if (activeRun != null)
			activeRun.cancelled = true;


		timer = setTimeout(() => {
			timer = undefined;

			const thisRun = { cancelled: false };
			activeRun = thisRun;

			void Promise.resolve(run({ isCancellationRequested: () => thisRun.cancelled })).finally(() => {
				if (activeRun === thisRun)
					activeRun = undefined;
			});
		}, delayMs);
	}

	return { schedule };
}
