// Pretending this is Lit's own module, so `html` and `classMap` are imported
// rather than declared locally -- real usage always imports `html` (e.g.
// `import { html } from "lit"`), and TypeScript only classifies an imported
// binding's own display part as "aliasName", which is what this server's
// filtering keys off.
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): unknown;
export declare function classMap(classInfo: Record<string, boolean>): unknown;
