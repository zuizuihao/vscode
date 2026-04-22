# Testing the Knowledge Library Extension

This note captures the current test entry points and authoring conventions for `extensions/knowledge-library/`.

## What Runs

The extension currently uses a single Mocha-based extension-host suite labeled `knowledge-library`.

- Suite label: `knowledge-library`
- Suite registration: `.vscode-test.js`
- Integration script routing: `scripts/test-integration.bat`
- Test workspace fixture: `extensions/knowledge-library/test-workspace/`
- Test sources: `extensions/knowledge-library/src/test/*.test.ts`

Even tests that exercise pure TypeScript helpers, such as `parser.test.ts` and `bm25.test.ts`, run through the same Mocha suite. Do not add `node:test`-only tests here unless you also introduce and document a separate runner for them.

## Run the Tests

From the repository root:

```powershell
scripts\test-integration.bat --suite knowledge-library
```

On macOS or Linux:

```bash
./scripts/test-integration.sh --suite knowledge-library
```

To run a single test or test group by name:

```powershell
scripts\test-integration.bat --suite knowledge-library --grep "Backlinks View"
```

The suite is also available through the shared test CLI configuration in `.vscode-test.js`, which loads compiled test output from `extensions/knowledge-library/out/**/*.test.js`.

## Compile Before Running

The suite runs compiled JavaScript from `out/`, so recompile the extension after changing test or source files.

From `extensions/knowledge-library/`:

```powershell
npm run compile
```

Equivalent command:

```powershell
node ..\..\node_modules\typescript\bin\tsc -p tsconfig.json
```

## Test Authoring Practices

- Use the repo's standard Mocha TDD style: `suite`, `test`, `setup`, and `teardown`.
- Import extension modules without a `.ts` suffix so the compiled `.js` output resolves correctly under the extension-host runner.
- Reuse helpers from `extensions/knowledge-library/src/test/testUtils.ts` for activation, workspace file setup, editor cleanup, and polling.
- When testing async indexing or diagnostics, wait on observable extension state with `waitUntil(...)` instead of relying on timing assumptions.
- Keep the suite workspace-driven: create files under `extensions/knowledge-library/test-workspace/wiki/` and assert against extension APIs, providers, diagnostics, or editor behavior.

## Where to Put New Tests

- Parser and indexing logic: `extensions/knowledge-library/src/test/parser.test.ts`
- Search ranking and BM25 behavior: `extensions/knowledge-library/src/test/bm25.test.ts`
- Wikilink editor features: `extensions/knowledge-library/src/test/markdownProviders.test.ts`
- Backlinks tree behavior: `extensions/knowledge-library/src/test/backlinksView.test.ts`
- Test controller behavior: `extensions/knowledge-library/src/test/wikiTestController.test.ts`

Add new tests to the existing suite unless there is a clear reason to create a separate test configuration.

## Troubleshooting

- If the test runner says it cannot find the `knowledge-library` label, check `.vscode-test.js` and `scripts/test-integration.bat`.
- If a file-change-driven test looks stale, confirm the extension has been recompiled and wait for the index or provider state to update before asserting.
- If a test depends on the active editor, open the document and wait until `vscode.window.activeTextEditor` reflects the expected file before checking provider output.
