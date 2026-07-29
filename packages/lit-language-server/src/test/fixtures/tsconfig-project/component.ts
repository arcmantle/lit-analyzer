// Pretending this is the Lit html function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const html: any;
declare const maybeString: string | null;

// Binding a nullable value to a native 'id' attribute (typed 'string') is
// only an error when 'strictNullChecks' is on -- toggled by editing the
// tsconfig this fixture belongs to.
html`<div id="${ maybeString }"></div>`;
