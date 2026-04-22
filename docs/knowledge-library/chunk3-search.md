# Chunk 3 — BM25 Search

**Goal**: Keyboard-triggered quick-pick search over wiki pages using in-process BM25 ranking.

---

## Files

| File | Purpose |
|---|---|
| `src/search/bm25.ts` | Pure TypeScript BM25 scorer |
| `src/search/searchProvider.ts` | `knowledge-library.searchWiki` command implementation |

---

## Algorithm

BM25 (Okapi BM25) ranks documents by term frequency against an inverted index.

```
score(d, q) = Σ IDF(t) × (tf(t,d) × (k1+1)) / (tf(t,d) + k1 × (1 - b + b × |d|/avgdl))
```

Parameters: `k1 = 1.5`, `b = 0.75`.

### Tokenizer

```typescript
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1);
}
```

Title tokens are boosted by 3× repetition before indexing.

---

## Key Types

```typescript
class BM25Index {
  build(pages: readonly WikiPage[]): void   // (re)build from index
  search(query: string, topK?: number): ScoredPage[]
}

interface ScoredPage {
  page: WikiPage;
  score: number;
}
```

### Lazy Rebuild

- The `BM25Index` is marked **dirty** when `IndexWatcher.onDidChange` fires.
- On next `search()` call, rebuild if dirty.
- This avoids rebuilding the BM25 index when the user is typing in the wiki (only pays cost at search time).

---

## Quick-pick UX

```
knowledge-library.searchWiki   (Ctrl+Shift+K when editing .md)
```

Quick-pick items:
- **label**: `$(file) page title`
- **description**: first matching tag or directory path
- **detail**: one-line description (truncated at 120 chars)

On selection → `vscode.window.showTextDocument(page.uri)`.

---

## Best Practices

- **No external npm dependencies** — pure TypeScript, no `lunr`, no `fuse.js`.
- **Lazy index rebuild** — only rebuild on `search()` if dirty, not on every wiki change.
- **Title boost** — index title tokens with 3× weight so title matches rank above body matches.
- **Top-K cap** — default `topK = 20`; don't return the whole index.
- **Stateless scorer** — `BM25Index.search()` is a pure function of the current index state; easy to test.
