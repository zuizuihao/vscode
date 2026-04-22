# Chunk 2 — WikiLink Language Providers

**Goal**: First-class `[[wikilink]]` support in markdown files: completions, go-to-definition, hover preview, broken-link diagnostics.

---

## Files

| File | Purpose |
|---|---|
| `src/wikiLink/completionProvider.ts` | `[[…]]` auto-completions |
| `src/wikiLink/definitionProvider.ts` | Ctrl+Click navigation to target page |
| `src/wikiLink/hoverProvider.ts` | Hover card showing first 3 paragraphs |
| `src/wikiLink/diagnosticsProvider.ts` | Warning for broken links; refreshed on change |

---

## Key Patterns

### Detecting a wikilink at cursor

```
trigger character: [
token regex:  \[\[([^\]|#]*)
```

The range of the link target is from `[[` to the next `]]`, `|`, or `#`.

### Completion

- Trigger on `[` — check if the preceding char is also `[`.
- Query `WikiIndex.getAllPages()` for titles, tags, descriptions.
- Return `CompletionItem[]` with `insertText` = page name, `detail` = tags, `documentation` = description.
- Use `CompletionItemKind.File`.

### Definition

- Extract the wikilink name under the cursor with the same regex.
- Call `WikiIndex.getPage(name)` → return `new vscode.Location(page.uri, new vscode.Position(0, 0))`.
- If the page doesn't exist, offer a **code action** "Create wiki page" (`vscode.CodeActionKind.QuickFix`).

### Hover

- Same extraction logic as Definition.
- Read the target page from the index; return the first 3 non-empty non-heading lines as `MarkdownString`.

### Diagnostics

- Maintain a single `vscode.DiagnosticCollection('knowledge-library')`.
- Re-validate all open markdown documents on:
  - `vscode.workspace.onDidChangeTextDocument` (debounce 500 ms)
  - `IndexWatcher.onDidChange` (full re-scan of open docs)
- For each `[[name]]` where `WikiIndex.pageExists(name) === false` → push a `vscode.Diagnostic` with severity `Warning`.

---

## Best Practices

- **Single `DiagnosticCollection`** shared across all documents; clear per document before re-validating.
- **Debounce text-change handler** (500 ms) to avoid re-indexing on every keystroke.
- **Lazy regex** — re-use the same compiled regex object; reset `lastIndex` before each use.
- **No DOM access** — all providers run in the extension host.
- **Register providers only for `markdown` language** to minimize overhead.
- **Return `null`** (not an empty array) from providers when outside a wikilink context.
