// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;

// The sibling lit-analyzer.config.json is intentionally invalid JSON. This
// should still produce a diagnostic (default config, 'no-noncallable-event-binding'
// defaults to "error"), plus a clear, loud error about the broken config --
// not a silent fallback.
html`<button @click="${ 'not a function' }"></button>`;
