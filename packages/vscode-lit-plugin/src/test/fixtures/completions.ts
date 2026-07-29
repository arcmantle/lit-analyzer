// Pretending this is the Lit html function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

/** An element to test autocomplete with. */
class CompleteMe extends HTMLElement {

	/** Docs for prop 1. */
	prop1 = '';
	/** Docs for prop 2. */
	prop2 = '';
	/** Docs for prop 3. */
	prop3 = '';

}
customElements.define('complete-me', CompleteMe);
declare global {
	interface HTMLElementTagNameMap {
		'complete-me': CompleteMe;
	}
}

// The lines below are the basis for the completion tests. `collect-observations.ts`
// finds them by content -- the partial tag `<com`, and the blank line inside the
// open `<complete-me>` tag -- so adding or removing lines here is safe. Keep both
// of those constructs intact.
html`
	<complete-me

	></complete-me>
	<com
`;

export {};
