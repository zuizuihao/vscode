# VS Code LLM Knowledge Library — Design Document

> Integrating Obsidian-style knowledge management and Karpathy's LLM Wiki pattern
> directly into VS Code, with GitHub Copilot as the persistent wiki maintainer.

---

## 1. Motivation

Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
describes a pattern where an LLM incrementally builds and maintains a persistent wiki —
a structured, interlinked collection of markdown files — rather than re-deriving answers
from raw documents on every query. Knowledge *compounds*; it is not re-discovered.

VS Code is already the primary environment where developers work with text, run agents,
and manage files. Today users keep VS Code open on one side and Obsidian on the other.
The goal of this design is to collapse that split: VS Code becomes the knowledge IDE,
GitHub Copilot becomes the wiki maintainer.

---

## 2. Core Concepts

### 2.1 Three-Layer Architecture (from Karpathy)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — Schema                                           │
│  AGENTS.md  — wiki conventions, workflows, entity types     │
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — Wiki  (LLM writes, human reads)                  │
│  wiki/index.md   wiki/log.md   wiki/concepts/   wiki/...    │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — Raw Sources  (human writes, LLM reads only)      │
│  raw/articles/  raw/papers/  raw/notes/  raw/assets/        │
└─────────────────────────────────────────────────────────────┘
```

The raw layer is immutable source-of-truth. The wiki layer is a compiled artifact the
LLM owns. The schema layer configures how the LLM behaves as a wiki maintainer across
sessions.

### 2.2 Obsidian Features to Bring In

| Obsidian Feature | VS Code Equivalent (to build) |
|---|---|
| `[[wikilink]]` syntax | First-class markdown provider with `[[…]]` completions and navigation |
| Graph view | `KnowledgeGraphPanel` — a WebView rendering an interactive force-directed graph |
| Backlinks panel | `BacklinksPanel` sidebar view |
| Dataview plugin | Frontmatter query provider (YAML-based dynamic tables) |
| Web Clipper extension | "Clip to Raw" command — saves the active browser tab / clipboard as markdown to `raw/` |
| Tag browser | Tag tree in the explorer sidebar |
| Daily note | "New Source" command with date-stamped template |
| Marp slide preview | Existing VS Code Markdown preview extended with Marp renderer |

---

## 3. Architecture

### 3.1 Extension Overview

A single built-in contribution called **`knowledge-library`** (living in
`extensions/knowledge-library/`) provides all features. It activates when a workspace
contains an `AGENTS.md` or `wiki/` directory.

```
extensions/knowledge-library/
├── package.json              # contribution points
├── src/
│   ├── extension.ts          # activation entry point
│   ├── wikiLink/
│   │   ├── completionProvider.ts   # [[…]] completions
│   │   ├── definitionProvider.ts   # Ctrl+Click navigate
│   │   ├── hoverProvider.ts        # preview on hover
│   │   └── diagnosticsProvider.ts  # broken-link warnings
│   ├── graph/
│   │   ├── graphPanel.ts           # WebView host
│   │   ├── graphRenderer/          # D3 force-directed graph (web bundle)
│   │   └── graphDataProvider.ts    # walks wiki/ for nodes + edges
│   ├── backlinks/
│   │   └── backlinksView.ts        # TreeView of inbound links
│   ├── index/
│   │   ├── wikiIndex.ts            # in-memory index of wiki pages
│   │   └── indexWatcher.ts         # FileSystemWatcher keeps it current
│   ├── search/
│   │   ├── bm25.ts                 # lightweight on-device BM25
│   │   └── searchProvider.ts       # quick-pick wiki search
│   ├── ingest/
│   │   ├── ingestCommand.ts        # "Ingest Source into Wiki" command
│   │   └── clipCommand.ts          # "Clip to Raw" command
│   ├── frontmatter/
│   │   └── dataviewProvider.ts     # render YAML query blocks
│   ├── schema/
│   │   └── schemaManager.ts        # reads AGENTS.md, exposes to agent
│   └── copilot/
│       ├── agentParticipant.ts     # @wiki chat participant
│       └── tools/
│           ├── ingestTool.ts       # tool: ingest a raw source
│           ├── queryTool.ts        # tool: query the wiki
│           ├── lintTool.ts         # tool: health-check the wiki
│           └── searchTool.ts       # tool: search wiki pages
└── media/
    └── graph/                      # bundled D3 renderer assets
```

Current testing commands and conventions live in `docs/knowledge-library/testing.md`.

### 3.2 Data Flow

```
User drops file into raw/
        │
        ▼
"Ingest Source" command
        │
        ▼
@wiki agent in Copilot Chat
  reads AGENTS.md (schema)
  reads raw source
  discusses takeaways with user
        │
        ▼
  writes/updates wiki pages:
    wiki/index.md  ← catalog entry added
    wiki/log.md    ← ingest entry appended
    wiki/topics/<topic>.md  ← page created or updated
    wiki/entities/<entity>.md  ← entity pages updated
        │
        ▼
IndexWatcher detects file changes
        │
        ├──► Graph view re-renders
        ├──► Backlinks panel updates
        └──► BM25 index rebuilt
```

---

## 4. Feature Specifications

### 4.1 WikiLink Support

**Syntax**: `[[Page Name]]` and `[[Page Name|Display Text]]`

**Completion provider** (`wikiLink/completionProvider.ts`):
- Triggers on `[[`
- Queries `wikiIndex` for all pages in `wiki/`
- Shows page title + one-line summary (from frontmatter `description:` or first paragraph)
- Accepts with `]]` auto-inserted

**Definition provider** (`wikiLink/definitionProvider.ts`):
- Ctrl+Click on `[[Page]]` opens `wiki/<page>.md`
- If page does not exist, offers "Create page" quick-fix via code action

**Hover provider** (`wikiLink/hoverProvider.ts`):
- Hovering over `[[Page]]` shows a markdown hover card with the first 3 paragraphs of the target page

**Diagnostics** (`wikiLink/diagnosticsProvider.ts`):
- Broken links (target file not found) reported as warnings
- Feeds into the "Lint" workflow — orphan pages and broken links surfaced in Problems panel

### 4.2 Graph View

A `WebviewPanel` rendered using D3.js force simulation.

**Nodes**: one per `wiki/*.md` file. Color-coded by frontmatter `tags:` or directory.

**Edges**: one per `[[wikilink]]` reference between pages. Edge weight = link count.

**Interactions**:
- Click a node to open the file in the editor
- Hover for page title + summary tooltip
- Filter by tag, date range, or search term (search box overlaid on graph)
- Toggle between "all pages", "local graph" (current file's neighborhood), and "orphans"

**Commands**:
- `knowledge-library.showGraph` — opens the graph panel
- `knowledge-library.showLocalGraph` — opens graph centered on the active file

**Implementation note**: Graph data is serialized to JSON by `graphDataProvider.ts` and
posted to the WebView via `panel.webview.postMessage`. The renderer is a self-contained
bundle in `media/graph/` to keep the extension host free of DOM dependencies.

### 4.3 Backlinks Panel

A `TreeView` contributed to the Explorer sidebar.

- Shows all pages that link to the currently active editor file
- Groups by link type (direct mention, tag match)
- Click-to-navigate to the linking line
- Updates on active editor change via `onDidChangeActiveTextEditor`

### 4.4 Wiki Index

`wikiIndex.ts` maintains an in-memory map of all wiki pages:

```typescript
interface WikiPage {
    filePath: string;
    title: string;
    description: string;
    tags: string[];
    links: string[];          // outbound [[wikilinks]]
    backlinks: string[];      // inbound links (computed)
    frontmatter: Record<string, unknown>;
    lastModified: number;
}
```

Built on startup by scanning `wiki/`. Kept current by a `FileSystemWatcher` on `wiki/**/*.md`.
Parsed with a lightweight regex-based frontmatter + link extractor (no heavy AST needed).

### 4.5 Search

**Quick-pick search** (`search/searchProvider.ts`):
- Command: `knowledge-library.searchWiki`
- Keybinding: `Ctrl+Shift+K`
- BM25 over page titles + full text from `wikiIndex`
- Result list shows title, tags, last-modified, and a one-line excerpt with query term highlighted
- At scale (>200 pages) the index is offloaded to an MCP server (see §5)

**Frontmatter query blocks** (`frontmatter/dataviewProvider.ts`):
- Code blocks tagged ` ```dataview ``` ` in markdown are rendered as dynamic tables
- Supported queries:

  ````markdown
  ```dataview
  TABLE title, tags, source-count
  FROM wiki/concepts
  WHERE tags CONTAINS "ml"
  SORT lastModified DESC
  ```
  ````

- Rendered inline in the Markdown preview panel using `MarkdownIt` plugin registration

### 4.6 Ingest Workflow

**Command**: `knowledge-library.ingestSource`

Triggered from:
- Right-click on a file in `raw/` → "Ingest into Wiki"
- Drag a file onto the Knowledge Library sidebar
- `@wiki ingest <path>` in Copilot Chat

**Flow**:
1. Command reads the source path and the current `AGENTS.md` schema
2. Opens Copilot Chat with the `@wiki` participant pre-populated:
   ```
   @wiki Please ingest raw/articles/foo.md into the wiki following the schema.
   ```
3. Copilot agent (via `ingestTool`) reads the source, proposes a summary, and writes/updates wiki pages
4. User reviews changes in the diff editor before Copilot commits them
5. `log.md` is updated with `## [<date>] ingest | <source title>`

### 4.7 Query Workflow

**Command**: `knowledge-library.queryWiki`

Triggered from `@wiki <question>` in Copilot Chat.

The `queryTool` flow:
1. Reads `wiki/index.md` to find relevant pages
2. Reads the relevant pages
3. Synthesizes an answer with citations (`[[Page Name]]` links)
4. Offers to save the answer as a new wiki page (compounds value back into the knowledge base)

### 4.8 Lint Workflow

**Command**: `knowledge-library.lintWiki`

Triggered periodically or on demand.

The `lintTool` checks for:
- Broken `[[wikilinks]]` → reported in Problems panel
- Orphan pages (no inbound links) → listed in a "Wiki Health" output channel
- Contradictions between pages → flagged by the Copilot agent with suggested resolutions
- Stale pages (last modified > threshold, but source has been updated)
- Missing index entries (page exists in `wiki/` but not in `index.md`)
- Important concepts mentioned across many pages but lacking a dedicated page

Results are written to `wiki/lint-<date>.md` and opened in a diff-friendly split view.

### 4.9 Clip to Raw

**Command**: `knowledge-library.clipToRaw`

- Reads the clipboard or the active Simple Browser tab
- Converts HTML to Markdown (using Turndown, already vendored in VS Code's markdown pipeline)
- Saves to `raw/clips/<date>-<slug>.md`
- Optionally triggers ingest immediately

### 4.10 Schema Manager

`schema/schemaManager.ts` reads `AGENTS.md` at workspace root (or a path configured in
settings) and exposes it as context to every `@wiki` tool call.  The schema defines:

- Directory layout conventions
- Page templates (entity page, concept page, source summary)
- Naming conventions
- Contradiction resolution policy
- Ingest workflow steps specific to the domain

The user and Copilot co-evolve this file over time. VS Code provides syntax highlighting
and completion for known schema keys.

---

## 5. Scalability: MCP Search Server

At small scale (~100 pages) the in-memory BM25 index suffices and no external service
is needed. As the wiki grows beyond ~200 pages, index.md overflows the LLM context window
and retrieval quality degrades.

The solution: an **MCP server** bundled with the extension that exposes a hybrid
BM25 + vector search tool.

```
extensions/knowledge-library/
└── mcp-server/
    ├── server.ts          # MCP server (stdio transport)
    ├── indexer.ts         # watches wiki/ and rebuilds BM25 + embeddings
    └── embeddings/        # on-device embedding via @xenova/transformers
```

The MCP server is registered automatically in `.vscode/mcp.json` when the extension
activates:

```json
{
  "servers": {
    "wiki-search": {
      "type": "stdio",
      "command": "node",
      "args": ["${extensionPath}/mcp-server/server.js", "${workspaceFolder}"]
    }
  }
}
```

Copilot's `searchTool` calls this MCP tool instead of the in-process BM25 once the
page count exceeds the configured threshold (`knowledgeLibrary.searchBackend`).

---

## 6. Settings

```json
{
  "knowledgeLibrary.rawDir": "raw",
  "knowledgeLibrary.wikiDir": "wiki",
  "knowledgeLibrary.schemaFile": "AGENTS.md",
  "knowledgeLibrary.searchBackend": "auto",
  "knowledgeLibrary.graphLayout": "force",
  "knowledgeLibrary.marpEnabled": true,
  "knowledgeLibrary.autoIngestOnDrop": false,
  "knowledgeLibrary.lintSchedule": "onSave",
  "knowledgeLibrary.frontmatterDateFormat": "YYYY-MM-DD",
  "knowledgeLibrary.pageTemplate": "default"
}
```

---

## 7. Copilot Agent Participant: `@wiki`

Registered as a chat participant (`vscode.chat.createChatParticipant`) with the following
tool set:

| Tool | Description |
|---|---|
| `wiki_search` | Full-text + semantic search over wiki pages |
| `wiki_read` | Read one or more wiki pages by path or title |
| `wiki_write` | Write or update a wiki page (diff shown to user before commit) |
| `wiki_ingest` | Full ingest workflow for a raw source |
| `wiki_lint` | Health-check the wiki |
| `wiki_index_update` | Update `index.md` and `log.md` |
| `raw_read` | Read a file from the raw sources layer |

The participant's system prompt is assembled from `AGENTS.md` + a fixed preamble
that explains the three-layer architecture and operational conventions.

**Example interactions**:

```
@wiki what are the main themes in my reading notes on attention mechanisms?

@wiki ingest raw/papers/attention-is-all-you-need.pdf

@wiki compare the approaches to positional encoding across all transformer papers

@wiki lint and suggest which orphan pages should be merged
```

---

## 8. Workspace Layout Convention

```
<workspace>/
├── AGENTS.md              ← schema: wiki conventions and workflows
├── raw/                   ← immutable source layer (human adds, LLM reads)
│   ├── articles/
│   ├── papers/
│   ├── clips/
│   └── assets/            ← locally downloaded images
├── wiki/                  ← LLM-maintained wiki layer
│   ├── index.md           ← content catalog: all pages with one-line summaries
│   ├── log.md             ← append-only chronological record
│   ├── overview.md        ← high-level synthesis
│   ├── concepts/          ← concept pages
│   ├── entities/          ← entity pages (people, orgs, products)
│   ├── sources/           ← per-source summary pages
│   └── analyses/          ← query outputs filed back as wiki pages
└── .vscode/
    └── mcp.json           ← wiki-search MCP server registration
```

---

## 9. Implementation Phases

### Phase 1 — Foundation (milestone: usable as Obsidian replacement)
- `[[wikilink]]` completion, navigation, and hover
- Broken-link diagnostics
- Basic in-memory wiki index
- BM25 quick-pick search
- Backlinks panel
- Graph view (static layout)

### Phase 2 — LLM Workflows
- `@wiki` chat participant
- Ingest, query, and lint tools
- Schema manager and AGENTS.md template
- `log.md` and `index.md` auto-update on wiki writes
- Clip to Raw command

### Phase 3 — Scale and Polish
- MCP search server with hybrid BM25 + vector retrieval
- Interactive graph (force simulation, filter, local graph mode)
- Dataview frontmatter query renderer
- Marp preview integration
- Contradiction detection and resolution UI
- Frontmatter-based tag browser in Explorer sidebar

### Phase 4 — Collaboration
- Git-backed change history surfaced in graph view (node color = recency)
- Multi-user wiki via Live Share — multiple agents can ingest concurrently
- Export wiki to static site (Docusaurus, MkDocs)

---

## 10. Key Design Decisions and Trade-offs

### LLM writes wiki; human reads wiki
Following Karpathy exactly: the wiki is the LLM's artifact. VS Code should not
prompt users to edit wiki pages directly (though they can). Diff review before commit
is the human's main control point.

### Markdown + git as the storage substrate
No database. Pages are plain `.md` files in a git repo. This gives version history,
branching, collaboration, and portability for free. The MCP server indexes on top of
the files; it is not the source of truth.

### Deterministic retrieval, probabilistic reasoning
Following the community discussion on the gist: the search index (BM25 + vector) is
deterministic infrastructure. Copilot reasons over the retrieved pages. Copilot does
not do set-operation scoping itself — the search tool handles that.

### Opt-in per-file wiki pointers
High-value source files may carry a frontmatter field `wiki: wiki/sources/foo.md` pointing
to their synthesized wiki page. This is the "librarian's index card" pattern — a
deterministic pointer, not a duplicate. Copilot reads the pointer before editing the
source and consults the wiki page for context.

### Contradiction policy belongs in AGENTS.md
The extension does not hard-code contradiction resolution. The schema file specifies
the policy (e.g., "newer source wins unless existing page has `confidence: high`").
The lint tool surfaces contradictions; Copilot resolves them per the schema.

---

## 11. References

- Karpathy, A. (2026). *LLM Wiki*. https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Obsidian: https://obsidian.md
- qmd (local markdown search): https://github.com/tobi/qmd
- Marp (markdown slides): https://marp.app
- Dataview (Obsidian plugin): https://blacksmithgu.github.io/obsidian-dataview/
- OpenWiki (reference implementation): https://github.com/kdsz001/OpenWiki
