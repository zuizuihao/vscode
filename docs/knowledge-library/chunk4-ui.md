# Chunk 4 — Backlinks Panel + Graph View + Extension Entry

**Goal**: Explorer backlinks tree view, a static force-directed graph WebView, and the `extension.ts` activation entry point that wires everything together.

---

## Files

| File | Purpose |
|---|---|
| `src/backlinks/backlinksView.ts` | `TreeDataProvider` for the Explorer backlinks panel |
| `src/graph/graphDataProvider.ts` | Serializes `WikiIndex` to `{ nodes, edges }` JSON |
| `src/graph/graphPanel.ts` | `WebviewPanel` host; posts data, handles node-click messages |
| `media/graph/index.html` | Self-contained D3 force graph renderer |
| `src/extension.ts` | Activation entry point; wires all providers together |

---

## Backlinks Panel

```typescript
class BacklinksProvider implements vscode.TreeDataProvider<BacklinkItem> {
  // Fires when active editor changes or index changes
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getChildren(): BacklinkItem[]   // backlinks for the current active .md file
  getTreeItem(item): vscode.TreeItem
}

class BacklinkItem extends vscode.TreeItem {
  // commandArgs: open the file at the linking line
}
```

Updates on:
1. `vscode.window.onDidChangeActiveTextEditor` — show backlinks for new active page.
2. `IndexWatcher.onDidChange` — refresh when index updates.

---

## Graph Panel

```
Extension host                WebView (sandboxed)
─────────────────             ──────────────────────────────────
graphPanel.ts                 media/graph/index.html
  │                             D3 force simulation
  ├─ postMessage({nodes,edges}) ─► render nodes + edges
  │                             user clicks a node
  └─ onDidReceiveMessage ◄────── { type:'open', name:'...' }
       → vscode.window.showTextDocument
```

### Content-Security-Policy

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
               style-src 'nonce-${nonce}';">
```

D3 is loaded from `https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js`.
For offline environments, bundle D3 into `media/graph/d3.min.js` and use a relative URI.

---

## Extension Entry Point

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const wikiDir = resolveWikiDir();    // reads config + workspace root
  if (!wikiDir) { return; }

  const index = new WikiIndex(wikiDir);
  const watcher = new IndexWatcher(index);
  context.subscriptions.push(watcher);
  await watcher.initialize();

  await vscode.commands.executeCommand('setContext', 'knowledgeLibrary.active', true);

  // Language providers (markdown only)
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(MARKDOWN_SELECTOR, new WikiLinkCompletionProvider(index), '['),
    vscode.languages.registerDefinitionProvider(MARKDOWN_SELECTOR, new WikiLinkDefinitionProvider(index)),
    vscode.languages.registerHoverProvider(MARKDOWN_SELECTOR, new WikiLinkHoverProvider(index)),
    new DiagnosticsProvider(index, watcher),

    // Search
    vscode.commands.registerCommand('knowledge-library.searchWiki', () => runWikiSearch(index)),

    // Graph
    vscode.commands.registerCommand('knowledge-library.showGraph', () => GraphPanel.show(context, index, undefined)),
    vscode.commands.registerCommand('knowledge-library.showLocalGraph', () => {
      const active = vscode.window.activeTextEditor?.document.uri;
      GraphPanel.show(context, index, active);
    }),

    // Backlinks
    vscode.window.registerTreeDataProvider('knowledge-library.backlinksView', new BacklinksProvider(index, watcher)),
  );
}
```

---

## Best Practices

- **`resolveWikiDir`** checks `knowledgeLibrary.wikiDir` setting + workspace root; returns `undefined` if no workspace (extension is a no-op outside a workspace).
- **Single `WikiIndex` instance** shared across all providers — no duplication.
- **`GraphPanel` is a singleton** (`createOrShow` pattern) — only one graph panel can be open.
- **Nonce for WebView CSP** — generate a fresh crypto-random nonce per panel creation, never reuse.
- **No DOM in extension host** — graph data (plain JSON) crosses the boundary via `postMessage`; D3 rendering is entirely inside the WebView sandbox.
- **`context.subscriptions.push(...)`** for every disposable created at activation time.
