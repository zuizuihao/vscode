# Chunk 1 — Foundation

**Goal**: Extension scaffold + in-memory wiki index that every other feature builds on.

---

## Files

| File | Purpose |
|---|---|
| `package.json` | Extension manifest: commands, views, keybindings, config |
| `package.nls.json` | Localized display strings |
| `tsconfig.json` | TypeScript compiler settings |
| `.npmrc` / `.vscodeignore` | Build tooling config |
| `src/index/wikiIndex.ts` | `WikiPage` type + `WikiIndex` class |
| `src/index/indexWatcher.ts` | `FileSystemWatcher` wrapper that keeps the index current |
| `build/gulpfile.extensions.ts` | Register tsconfig for the compile pipeline |
| `build/npm/dirs.ts` | Register directory for `npm install` |

---

## Key Types

```typescript
interface WikiPage {
  uri: vscode.Uri;
  title: string;           // frontmatter title: or first # Heading or filename
  description: string;     // frontmatter description: or first paragraph
  tags: string[];          // frontmatter tags:
  links: string[];         // outbound [[wikilinks]], normalized
  backlinks: string[];     // inbound, computed on every write
  frontmatter: Record<string, unknown>;
  lastModified: number;    // Date.now() when last indexed
}

class WikiIndex {
  addOrUpdatePage(uri, text, lastModified): void
  deletePage(uri): void
  getPage(name): WikiPage | undefined
  getAllPages(): readonly WikiPage[]
  getBacklinksFor(name): readonly WikiPage[]
  pageExists(name): boolean
}

class IndexWatcher implements vscode.Disposable {
  constructor(index: WikiIndex)
  initialize(): Promise<void>   // scan wikiDir once on startup
  onDidChange: vscode.Event<void>
}
```

---

## Best Practices

- **No external npm dependencies** — parse YAML frontmatter with a lightweight line parser (no `js-yaml`).
- **Normalize page names** to lowercase path relative to `wikiDir`, no `.md` extension. Use `uri.toString(true)` for reliable URI comparison across platforms.
- **Recompute backlinks in full** on every change — O(n×k), acceptable for <200 pages.
- **Correlated `FileSystemWatcher`** via `vscode.RelativePattern(wikiDir, '**/*.md')`, not the shared global watcher.
- **`vscode.Uri` everywhere** — never raw string paths.
- **All `EventEmitter` instances** go into the disposables array; dispose them with the watcher.
- **Copyright header** on every `.ts` file.
- **Tabs, not spaces**; double quotes for user-facing strings, single quotes otherwise.
