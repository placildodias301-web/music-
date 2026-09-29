# Wilsify AI — Documentation Style Guide

Purpose: one writing standard so every document in this repository reads like it belongs to the same system. Apply this to new documents and when editing existing ones — it is not required to rewrite an untouched document purely to comply.

---

## Headings

- One `#` H1 per document, matching the title in `docs/README.md`'s index.
- `##` for major sections, `###` for subsections. Never skip a level (no `##` straight to `####`).
- Sentence case for headings ("Environment variables", not "Environment Variables") **except** for proper nouns, product names, and acronyms (`API`, `PostgreSQL`, `AI Tutor`, `Wilsify AI`). Existing Title Case headings are not being mass-converted this pass — sentence case applies going forward and wherever else a document is already being edited.
- Section dividers: a bare `---` line between major `##` sections in long reference docs (already the repo's dominant convention). Do not add dividers between every subsection — only between top-level sections.

## Tables

- Always include a header separator row: `|---|---|`.
- Left-align by default; do not hand-craft `:---:` centering unless the column is genuinely a short status glyph column (✅/⚠️/🔴).
- Keep a table's column count consistent through every row.

## Callouts

Use a blockquote with a **bold label** prefix — no admonition plugin syntax (this repo renders on plain GitHub Markdown):

```markdown
> **Note:** Text here.
> **Warning:** Text here.
> **Tip:** Text here.
```

- **Note** — supplementary information.
- **Warning** — something that will break or cost time if ignored.
- **Tip** — an optional shortcut or recommendation.

Don't invent new callout labels beyond Note/Warning/Tip. A `>` blockquote without a bold label is fine for a short "start here" pointer at the top of a document (already used in several docs) — that's a navigation aid, not a callout, and doesn't need a label.

## Code Blocks

- Always tag the language: ` ```bash `, ` ```typescript `, ` ```python `, ` ```json `, ` ```sql `, ` ```yaml `. Use ` ```text ` for plain output/logs, never an untagged fence.
- Shell examples use `bash` fencing even for Windows-agnostic commands; call out PowerShell-specific syntax inline only when a command genuinely differs.
- One command per conceptual step; comment inline with `#` to explain non-obvious flags rather than prose before every line.

## Mermaid Diagrams

- One direction per diagram: `flowchart LR` for pipelines/request flows, `sequenceDiagram` for multi-actor request/response flows, `erDiagram` for data models. Don't mix `graph TD` and `flowchart LR` across sibling diagrams in the same document.
- Node labels use the domain term as it appears in code (`AnalysisService`, not `Analysis Service` or `analysis-service`) so diagrams are grep-able against the codebase.
- No duplicate node definitions within one diagram.

## Terminology (use exactly these forms)

| Use this | Not this |
|---|---|
| Wilsify AI | Wilsify, wilsify-ai (product name) |
| backend | Backend API, the API server |
| AI service | AI Service, ai-service (in prose) |
| web app / web dashboard | webapp, Web-App |
| mobile app | Mobile App, the RN app |
| `mobile_app/` | `mobile-rn/` (renamed; if you see this, it's stale — fix it) |
| PostgreSQL | Postgres (fine in casual asides, not in headings) |
| plan tiers: FREE, PRO, STUDIO, ENTERPRISE | free/pro/studio/enterprise in prose (keep the DB enum casing when naming a plan) |

## Capitalization

- Product/service names as above.
- File and path names in backtick code spans, always: `` `ENVIRONMENT.md` ``, `` `backend/src/` ``.
- Environment variables in backtick code spans, always: `` `DATABASE_URL` ``.

## File Naming

- Reference docs: `SCREAMING_SNAKE_CASE.md` (matches the existing convention — `ARCHITECTURE.md`, `DEPLOYMENT.md`).
- Folders: lowercase (`architecture/`, `deployment/`).
- No spaces, no mixed case, in any doc filename.

## Emoji

- Used sparingly and only for status/priority glyphs in checklists and tables: ✅ ⚠️ ❌ 🔴 🟡 🟢. Not used decoratively in headings or prose.

## Standard Document Layout

Longer reference and guide documents should follow this shape (short reference tables like `CHANGELOG.md` are exempt — don't force process sections onto a changelog):

```markdown
# Title

One-sentence description of what this document covers.

---

## Purpose

Why this document exists / what question it answers.

## Audience

Who should read this.

## Prerequisites

(If applicable — link out, don't restate.)

## Main Content

The actual reference material, in whatever section structure fits the topic.

---

## Related Documents

- [Doc Name](path.md) — one-line reason to read it

## Last Updated

YYYY-MM (optional — omit rather than let it go stale silently).
```

## Navigation

Every document under `docs/` should end with (or near the end have) a **Related Documents** section linking to the 2–5 documents a reader would plausibly go to next, plus a link back to [docs/README.md](README.md). Sprint reports and archived snapshots are exempt — they're read once, not navigated through.

## Links

- Always relative, never absolute repo URLs, for links within this repository.
- Link text matches the target document's actual title, not a paraphrase.

---

## Related Documents

- [docs/README.md](README.md) — documentation map
- [docs/development/PROJECT_PLAN.md](development/PROJECT_PLAN.md) — Quality Gates section references "Documentation current" as a release requirement; this style guide is what "current" is checked against
