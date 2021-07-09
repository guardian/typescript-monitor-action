# Typescript and ESLint error checking action

This action checks the amount of Typescript and/or ESLint errors on a pull request compared to the base branch. It's intended to be used in migration projects, when migrating an existing project to Typescript or expanding the linting rules, to allow existing code that has errors to not break builds but without allowing new PRs to introduce further errors to the migrated code.

## Inputs

### 'repo-token'

**Required** Your repo's Github token

### 'check-typescript'

Whether or not to check for TS errors, using the project's `tsconfig.json`.
**Default**: true

### 'check-linting'

Whether or not to check for linting errors, using the provided lint script.
**Default**: true

### 'lint-script'

The linting script to run.
**Default**: 'npx eslint'

## Outputs

## 'ts-errors'

The number of Typescript errors, as compared to the main branch.

## 'lint-errors'

The number of linting errors, as compared to the main branch.

## Example usage

uses: actions/ts-error-check@v0.1
with:
  lint-script: 'yarn lint:check'
