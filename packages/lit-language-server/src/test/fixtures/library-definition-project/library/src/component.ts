export class LibraryElement extends HTMLElement {}

customElements.define('library-element', LibraryElement);

declare global {
	interface HTMLElementTagNameMap {
		'library-element': LibraryElement;
	}
}
