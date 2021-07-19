# Typescript Monitor Action

This action checks the amount of Typescript and/or ESLint errors on a pull request compared to the base branch. It's intended to be used in migration projects, when migrating an existing project to Typescript or expanding the linting rules, to allow existing code that has errors to not break builds, but without allowing new PRs to introduce further errors to the migrated code.

A comment will be generated on the associated pull request specifying how the error count has changed. An increase in the amount of either kind of error will fail the check.

## Inputs

### `repo-token`

**Required** Your repo's Github token

### `cwd`

A directory to switch into before installing JS/TS dependencies, where the TS and ESLint scripts should be run.

### `check-typescript`

Whether or not to check for TS errors, using the project's `tsconfig.json`.
**Default**: true

### `check-linting`

Whether or not to check for linting errors, using the provided lint script.
**Default**: true

### `ts-script`

The TS compilation script to run.
**Default**: 'npx tsc'

### `lint-script`

The linting script to run.
**Default**: 'npx eslint'

## Example usage

```yaml
name: Typescript Monitor

on: [pull_request]

jobs:
    typescript_monitor:
        name: Typescript Monitor
        defaults:
          run:
            working-directory: support-frontend
        runs-on: ubuntu-latest
        steps:

        - name: Checkout code
          uses: actions/checkout@v2

        - name: Install Node
          uses: guardian/actions-setup-node@main

        # Cache npm dependencies using https://github.com/bahmutov/npm-install
        - name: Cache dependencies
          uses: bahmutov/npm-install@v1
          with:
            working-directory: support-frontend

        - name: Check for new errors
          uses: guardian/typescript-monitor-action@main
          with:
            repo-token: '${{ secrets.GITHUB_TOKEN }}'
            cwd: './client'
            ts-script: 'yarn tsc --allowJs --noEmit'
            lint-script: 'yarn lint:check'
```
