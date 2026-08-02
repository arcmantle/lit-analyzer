<div align="center">

<img src="https://raw.githubusercontent.com/arcmantle/lit-analyzer/master/packages/vscode-lit-plugin/docs/assets/lit-plugin%40256w.png" width="160" alt="lit-plugin2 logo"/>

# lit-plugin2

Type checking, code completion and syntax highlighting for `lit-html` templates in Visual Studio Code.

<img src="https://raw.githubusercontent.com/arcmantle/lit-analyzer/master/packages/vscode-lit-plugin/docs/assets/lit-plugin.gif" alt="A lit-html template with diagnostics and code completion"/>

</div>

## What this extension does

This extension reads the `html` and `css` tagged template literals in your JavaScript and TypeScript
files. It then gives you the same help inside a template that you get in ordinary code:

- It reports errors in a template while you type.
- It completes tag names, attribute names, property names and event names.
- It shows type information and documentation when you point at a name.
- It finds the custom elements in your project automatically.

## Installation

Install the packaged extension from a `.vsix` file:

```sh
code --install-extension lit-plugin.vsix
```

To build that file from this repository, run `pnpm run package` in `packages/vscode-lit-plugin`.

## Features

### Diagnostics

The extension applies a set of rules to each template. A rule can report an error, report a warning,
or stay off. The [Rules](#rules) section lists all of them.

### Code completion

Push `Ctrl+Space` in an `html` or a `css` template to get completions. The extension completes tag
names, attributes, properties, events, CSS properties and CSS parts.

### Quick info

Point at a tag, an attribute, a property or an event. The extension shows the type of the identifier
and its JSDoc comment.

### Go to definition

Push `Cmd+Click` on macOS, or `Ctrl+Click` on Windows and Linux, on a tag, an attribute, a property
or an event. The editor opens the declaration.

### Automatic tag close

The extension closes an html tag for you when you type it inside a template.

### Custom element discovery

The extension finds a custom element that you declare anywhere in your project. It then gives you
completion, type checking and an automatic import for that element. It uses
[web-component-analyzer](https://github.com/arcmantle/lit-analyzer/tree/master/packages/web-component-analyzer)
to read the element.

### Elements from a dependency

A dependency can add its elements to the global `HTMLElementTagNameMap` interface. The extension
reads that map and applies the same checks to those elements.

```ts
declare global {
	interface HTMLElementTagNameMap {
		'my-element': MyElement;
	}
}
```

Two limits apply to an element that you get this way:

- The extension reads only the public fields and their types. It does not read a `@property`
  decorator or a field initializer. Each property is therefore optional.
- The extension finds the element only after some file in your project imports it. TypeScript adds a
  library file to the program at the point of the import, and not before it.

## Rules

The default severity of a rule depends on the `strict` option. Strict mode is off by default. Set
the severity of any rule to `off`, `warning` or `error` with the `rules` option.

The [full rule reference](https://github.com/arcmantle/lit-analyzer/blob/master/docs/readme/rules.md)
gives an example for each rule.

**Custom elements**

| Rule | Description | Normal | Strict |
| :--- | :---------- | :----- | :----- |
| `no-unknown-tag-name` | Checks that the tag name exists. The extension does not find every element from every library. | off | warning |
| `no-missing-import` | Checks that the file imports the element that the template uses. | off | warning |
| `no-unclosed-tag` | Checks for an unclosed tag, and for an invalid self-closing tag. | warning | error |
| `no-missing-element-type-definition` | Checks that the element is registered on `HTMLElementTagNameMap`. | off | off |

**Binding names**

| Rule | Description | Normal | Strict |
| :--- | :---------- | :----- | :----- |
| `no-unknown-attribute` | Checks that the attribute exists on the element. | off | warning |
| `no-unknown-property` | Checks that the property exists on the element. | off | warning |
| `no-unknown-event` | Checks that the element fires the event. | off | off |
| `no-unknown-slot` | Checks the slot name against the `@slot` JSDoc tags on the element. | off | warning |
| `no-legacy-attribute` | Reports the legacy Polymer binding syntax, such as `foo$=`. | off | warning |

**Binding types**

| Rule | Description | Normal | Strict |
| :--- | :---------- | :----- | :----- |
| `no-expressionless-property-binding` | Reports a property binding that has no expression. | error | error |
| `no-noncallable-event-binding` | Reports an event binding whose value you cannot call. | error | error |
| `no-boolean-in-attribute-binding` | Reports a boolean value in an attribute binding. | error | error |
| `no-complex-attribute-binding` | Reports a complex value in an attribute binding. | error | error |
| `no-nullable-attribute-binding` | Reports a `null` or an `undefined` value in an attribute binding. | error | error |
| `no-incompatible-type-binding` | Reports a value whose type does not match the target. | error | error |
| `no-invalid-directive-binding` | Reports a built-in directive in a binding that does not accept it. | error | error |
| `no-unintended-mixed-binding` | Reports a `'`, `"`, `}` or `/` character that the binding includes by mistake. | warning | warning |

**LitElement**

| Rule | Description | Normal | Strict |
| :--- | :---------- | :----- | :----- |
| `no-incompatible-property-type` | Checks the `type` option of a `@property` decorator against the declared TypeScript type. | warning | error |
| `no-invalid-attribute-name` | Checks that the `attribute` option is a valid attribute name. | error | error |
| `no-invalid-tag-name` | Checks that the tag name of a custom element is valid. | error | error |
| `no-property-visibility-mismatch` | Checks that a public property uses `@property`, and that a non-public property uses `@internalProperty`. | off | warning |

**CSS**

| Rule | Description | Normal | Strict |
| :--- | :---------- | :----- | :----- |
| `no-invalid-css` | Checks the CSS inside a `css` template. | warning | error |

## Configuration

Open `Settings` > `Extensions` > `lit-plugin2` to set an option.

You can also set the same options in a `tsconfig.json` file. See
[ts-lit-plugin](https://github.com/arcmantle/lit-analyzer/tree/master/packages/ts-lit-plugin) for the
`tsconfig.json` form.

| Option | Description | Type | Default |
| :----- | :---------- | :--- | :------ |
| `strict` | Changes which rules apply by default. | `boolean` | `false` |
| `rules` | Sets the severity of one rule or more. Example: `{"no-unknown-tag-name": "off"}`. | `{ [rule]: "off" \| "warn" \| "error" }` | Depends on `strict` |
| `disable` | Turns the extension off. | `boolean` | `false` |
| `dontShowSuggestions` | Hides the suggestions. | `boolean` | `false` |
| `htmlTemplateTags` | The template tags that hold html. | `string[]` | `["html", "raw"]` |
| `cssTemplateTags` | The template tags that hold CSS. | `string[]` | `["css"]` |
| `globalTags` | The tag names that are always available. | `string[]` | |
| `globalAttributes` | The attribute names that are always available. | `string[]` | |
| `globalEvents` | The event names that are always available. | `string[]` | |
| `customHtmlData` | Element data in the [VS Code custom HTML data format](https://code.visualstudio.com/updates/v1_31#_html-and-css-custom-data-support). Accepts an array, an object, or a relative file path. | See the [format](https://github.com/Microsoft/vscode-html-languageservice/blob/master/docs/customData.md) | |
| `maxProjectImportDepth` | How many modules deep the extension follows an import in your project to find an element. `-1` means no limit. | `number` | `-1` |
| `maxNodeModuleImportDepth` | How many modules deep the extension follows an import in an npm package to find an element. `-1` means no limit. | `number` | `1` |

## Documenting an element

The extension reads your code to find the properties, the attributes and the events of an element.
Some of them are not visible in the code. Document those with JSDoc:

```js
/**
 * This is my element.
 * @attr size
 * @attr {red|blue} color - The color of the element
 * @prop {String} value
 * @prop {Boolean} myProp - This is my property
 * @fires change
 * @fires my-event - This is my own event
 * @slot - This is the unnamed slot
 * @slot right - The right content
 * @slot left
 * @cssprop {Color} --border-color
 * @csspart header
 */
class MyElement extends HTMLElement {
}

customElements.define('my-element', MyElement);
```

## How this extension works

Three libraries give the extension its features:

- [ts-lit-plugin](https://github.com/arcmantle/lit-analyzer/tree/master/packages/ts-lit-plugin) gives
  the diagnostics, the completions and the type information, through the TypeScript language service.
- [vscode-lit-html](https://github.com/mjbvz/vscode-lit-html) highlights the `html` template tag.
- [vscode-styled-components](https://github.com/styled-components/vscode-styled-components) highlights
  the `css` template tag.

This extension holds them together. It also copies the relevant VS Code settings into
`ts-lit-plugin`.

Report a problem with syntax highlighting to the highlighting library. Report all other problems to
[this repository](https://github.com/arcmantle/lit-analyzer/issues).

## Contributing

See [CONTRIBUTING.md](https://github.com/arcmantle/lit-analyzer/blob/master/CONTRIBUTING.md).

## License

MIT. See [LICENSE.md](./LICENSE.md).

This extension is a fork of [lit-analyzer](https://github.com/runem/lit-analyzer) by Rune Mehlsen and
Andreas Mehlsen. The original copyright notice stays in the license file.
