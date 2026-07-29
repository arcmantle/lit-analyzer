export class MyElement extends HTMLElement {

	foo = '';

	fireIt(): void {
		this.dispatchEvent(new CustomEvent('my-event'));
	}

}

customElements.define('my-element', MyElement);
