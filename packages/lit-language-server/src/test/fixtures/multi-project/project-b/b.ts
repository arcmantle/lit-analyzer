// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// A boolean attribute binding ('?attr') with no expression always triggers
// 'no-expressionless-property-binding' -- deliberately chosen, like a.ts's
// 'no-noncallable-event-binding', because it defaults to "error" regardless
// of config, so it doesn't depend on config wiring this server doesn't do
// yet. Distinct from a.ts's rule, so the two projects' diagnostics are easy
// to tell apart in a test.
html`<div ?hidden></div>`;
