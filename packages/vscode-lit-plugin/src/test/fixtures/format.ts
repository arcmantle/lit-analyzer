declare const html: any;
declare const localize: (key: string) => string;
declare const readonly: boolean;
declare const spellcheck: boolean;

html`<es-input
	id="search"
	size="small"
	placeholder=${ localize('info.filterCompanies') }
	.spellcheck=${ spellcheck }
	?readonly=${ readonly }
></es-input>`;
