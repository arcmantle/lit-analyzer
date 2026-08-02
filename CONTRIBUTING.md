# Contributing

Hi there, I really appreciate you considering contributing to this repository! This readme hopefully contains what you need to get started. If you have any questions please open an issue or PM me on twitter [@RuneMehlsen](https://twitter.com/RuneMehlsen).

1. Clone the monorepo: `git clone https://github.com/runem/lit-analyzer.git`
2. Install dependencies: `pnpm install`
3. Run tests: `pnpm test`

This is a [pnpm workspace](https://pnpm.io/workspaces), and it requires Node.js 24 or newer. TypeScript is declared once, as a [catalog](https://pnpm.io/catalogs) entry in `pnpm-workspace.yaml`, and every package consumes it with `"typescript": "catalog:"` — including `packages/playground`. Change it there, not in the individual packages.

## Contributing to readmes

Readme's are built because a lot of information is repeated in individual readmes. If you want to change something in a readme, please change files in [/docs/readme](/docs/readme), [/packages/lit-analyzer/readme](/packages/lit-analyzer/readme), [/packages/ts-lit-plugin/readme](/packages/ts-lit-plugin/readme), [/packages/vscode-lit-plugin/readme](/packages/vscode-lit-plugin/readme). Never change the README.md directly because it will be overwritten.

Please run `pnpm readme` when you want to rebuild all readme files.

## Contributing to lit-analyzer or ts-lit-plugin

### Debugging the CLI

You can always try out the CLI by running `./cli.js path-to-a-file.js` from `packages/lit-analyzer`.

### Debugging the language service

You can try out changes to lit-analyzer and/or ts-lit-plugin directly from the Typescript Language Service in VS Code:

1. Run `pnpm dev` from `/` to open a playground in VS Code (lit-plugin is disabled in that session to prevent interference).
2. Run `pnpm dev:logs` from `/` to watch logs in real time.

### `pnpm watch` / `pnpm build`

You can run either `pnpm watch` or `pnpm build` from the repository root or from any subpackage.

## Contributing to vscode-lit-plugin

### Debugging

In order to debug `vscode-lit-plugin` you can open vscode from `packages/vscode-lit-plugin` and press the **start debugging** button in vscode.

### `pnpm package`

You can use this script if you want to generate an installable package of vscode-lit-plugin. Afterwards, run `code --install-extension ./lit-plugin.vsix` to install it.

## Releasing

Versioning and publishing are two separate steps.

1. Bump versions across the workspace: `pnpm release:version <major|minor|patch>` (or `pnpm release:version:next` for a `next` prerelease).
2. Publish: `pnpm publish` (or `pnpm publish:next`).

Cross-package dependencies are declared as `workspace:*`, which pnpm rewrites to the exact published version at publish time.

### Syntaxes

All syntaxes come from [vscode-lit-html](https://github.com/mjbvz/vscode-lit-html) and [vscode-styled-components](https://github.com/styled-components/vscode-styled-components). Because these repositories are not published as npm-packages, they are instead installed from Github URLs. Therefore, as of now, changes to syntaxes must be upstreamed to one of these repositories.
