---
title: Core Concepts
description: "How OpenKnowledge works: the three-layer model, the file system as the database, links and backlinks, the well-connected knowledge base, and attribution."
---

This page is the precise reference for the ideas the rest of the docs build on. If you want the persuasive tour instead, start with the [Overview](../get-started/overview.mdx); if you want to start using it, see the [Quickstart](../get-started/quickstart.mdx).

## Three layers

OpenKnowledge is three layers working together: a surface you edit, an engine that keeps it consistent, and the files underneath.

<Cards>
  <Card title="The editor" href="../features/editor.mdx">
    The application you see: a beautiful, themeable markdown editor that renders rich extensions (Mermaid, LaTeX, video and asset embeds, callouts, collapsible sections, interactive HTML) and lets you read and write your knowledge base directly.
  </Card>
  <Card title="The knowledge engine" href="./mcp.mdx">
    The framework underneath: an MCP server that lets any AI agent read and write your knowledge base while keeping front matter consistent, references intact, and the link graph healthy.
  </Card>
  <Card title="The content" href="#the-file-system-is-the-database">
    The files underneath: plain markdown in your own project directory, version-controlled by git. This is the durable layer the other two operate on, described in detail below.
  </Card>
</Cards>

All three layers operate on the **same files**. You can edit through the editor, an agent can edit through the knowledge engine's MCP tools, and you can always drop down to any text editor and change the markdown by hand. Nothing locks you out.

Because the knowledge engine is exposed over [MCP](https://modelcontextprotocol.io), it is **agent-agnostic**. Bring Claude Code, Cursor, Codex, OpenCode, Gemini, or any MCP-capable client, and any model you have access to.

## The file system is the database

The third layer is the content itself. OpenKnowledge has **no database dependency**. Your knowledge base is plain markdown files in your own project directory, and the only persistence layer is the file system, version-controlled by git.

This means:

- **No lock-in.** Your knowledge is portable markdown you can read, grep, diff, and commit with ordinary tools.
- **Almost nothing to install.** The recommended path is the macOS app; there is no separate database or service to run.
- **The engine is a management layer, not a gatekeeper.** It maintains consistency when you go through it, but editing the raw files yourself is always allowed.

The set of files the engine treats as your knowledge base is the configured content directory. See [Configuration](./configuration.mdx) for where that and other settings live.

## Links and backlinks

Internal cross-references are written with **standard markdown links**. The recommended form is **relative** — `[text](./sibling.md)`, `[text](../folder/doc.md)` — which stays portable across GitHub, Obsidian, VS Code, and published sites. A **root-absolute** form (`[text](/folder/doc.md)`, where the leading slash means the content root) is equally valid and convenient for cross-folder links. The two never mix: never glue `./` onto a content-root path, since `./folder/doc.md` written from a doc already inside `folder/` resolves to the doubled, broken `folder/folder/doc.md` — `write`/`edit` flag exactly this in their `brokenLinks` response. Whenever document A links to document B, OpenKnowledge automatically records the inverse on B: a **backlink** from B back to A.

You never write backlinks by hand. They are computed from the links you already write, and together they form the **link graph**: the network of relationships across your knowledge base.

<Callout type="info">
  Backlinks are the payoff of ordinary linking. Every internal link you write earns a backlink on the target for free, so the graph grows as a side effect of normal writing.
</Callout>

## The well-connected knowledge base

"Well-connected" is not a vibe; it has concrete substance:

> **A well-connected knowledge base = backlinks + the link-graph tools (dead / orphans / hubs / suggest) + closed-loop grounding.**

### Backlinks

The automatic inverse relationships described above. They turn a pile of files into a navigable graph.

### The link-graph tools

The knowledge engine exposes a [`links`](./mcp.mdx) tool whose `kind` selects a view of the graph. Four of these views are how you keep the graph healthy:

| View | What it surfaces |
| --- | --- |
| `dead` | Links that point at documents that don't exist: broken references to fix or remove. |
| `orphans` | Documents nothing links to: knowledge that's effectively unreachable. |
| `hubs` | The most-linked-to documents: the natural centers of gravity in your KB. |
| `suggest` | Likely-missing links between related documents: connections worth adding. |

Agents use these to repair and densify the graph as they work, instead of letting it rot.

### Closed-loop grounding

Every factual claim should trace back to a source **inside** the knowledge base. External material is pulled in and cited locally rather than linked off to the open web, so the knowledge base stays self-contained and auditable. This is the backbone of the source-grounded workflows: see [Karpathy's LLM wiki workflow](../workflows/karpathy-llm-wiki.mdx) and the [Entity vault (GBrain-compatible) workflow](../workflows/entity-vault.mdx).

<Callout type="info">
  OpenKnowledge is unopinionated about which workflow you adopt; these are supported patterns, not requirements. Grounding, backlinks, and the graph tools work the same regardless of how you choose to organize.
</Callout>

## Attribution and collaboration

Every change made through OpenKnowledge is tracked, with **attribution** to whoever made it: a human author or a specific AI agent. The change history is persisted in the file system with no dependency beyond git.

That gives you:

- **A changelog** of every edit across the knowledge base.
- **Point-in-time history.** Revert to any earlier state.
- **Per-author views.** See exactly what one human or one agent changed.

Because humans and agents edit the same files through the same tracked layer, collaboration is a first-class property of the system rather than something bolted on.
