---
name: cognee-memory
description: Use the shared cognee knowledge graph as long-term memory — recall relevant context before starting work, remember distilled lessons after. Trigger: "remember this", "recall", "what do we know about", "cognee", "check memory", "save to memory", or when prior project knowledge would help.
when_to_use: Before non-trivial work in a project that has a cognee dataset (see ~/Desktop/cognee/DATASETS.md), and after producing a decision, fix, or discovery worth persisting across sessions.
user-invocable: true
disable-model-invocation: false
---

# cognee-memory

Shared keyless cognee instance at `~/Desktop/cognee`. You are the extractor:
cognee stores what you write — write distilled knowledge, not raw dumps.

## Setup (once per project)

```bash
~/Desktop/cognee/bin/mem init      # register dataset, install all skills, write .mcp.json
~/Desktop/cognee/bin/mem ingest    # stage session transcripts + ingest docs/README/sessions
```

Slash commands (installed by `mem init`):
`/skill:mem-init` `/skill:mem-ingest` `/skill:mem-recall` `/skill:mem-remember`
`/skill:mem-status` `/skill:mem-datasets` `/skill:mem-dashboard`

## Wrapper

```bash
~/Desktop/cognee/bin/cog <project> <remember|recall|forget> [args...]
# or from inside a project dir:
~/Desktop/cognee/bin/mem recall "<query>"     # auto-dataset from cwd
~/Desktop/cognee/bin/mem remember "<text>"
~/Desktop/cognee/bin/mem status               # item count
~/Desktop/cognee/bin/mem datasets             # all datasets
```


- `<project>` = short name; dataset is `p-<project>` automatically.
- Registry of known datasets: `~/Desktop/cognee/DATASETS.md`.
- Kuzu is single-writer: NEVER run two `cog` commands concurrently.
- Keyless mode: `recall` MUST pass `-t CHUNKS` (completion types need an LLM key).

## Recall (before work)

```bash
~/Desktop/cognee/bin/cog <project> recall "<specific query>" -t CHUNKS
```

- Query with concrete nouns: ticket IDs, file names, feature names — not "tell me about X".
- KNOWN LIMITATION (cognee 1.6.0 keyless): dataset filtering is broken —
  results come from the GLOBAL graph across all projects. Treat hits as
  cross-project memory; check `document_name`/`dataset_name` in results to
  attribute them. This is a feature for shared context, a bug for isolation.
- Empty/irrelevant results → proceed without memory; do not retry more than once.

## Remember (after work)

Distill FIRST, then store. A memory is a decision, fix, invariant, or
file→purpose map — not a transcript.

```bash
~/Desktop/cognee/bin/cog <project> remember "<distilled text>"
```

Write memories as compact structured text:

```
[decision] <what was decided> — because <reason>. Affects: <files/areas>.
[fix] <symptom> → <root cause> → <fix>. Files: <paths>.
[invariant] <rule that must hold>. Violated by: <what breaks it>.
[map] <path/module> = <purpose>. Owner: <area>.
```

- One memory per call; batch related facts into one text block, not one call per fact.
- For file content (docs, specs): `cog <project> remember <path>` — real paths only
  (nonexistent absolute-looking paths are ingested as literal text).
- Session-scoped scratch (not permanent): add `--session-id <id>` — stays in
  session cache, skips the permanent graph.

## Forget

```bash
~/Desktop/cognee/bin/cog <project> forget --dataset p-<project>   # whole dataset
```

Item-level forget needs the item id — prefer dataset-level or leave stale
memories (recall ranks by relevance; stale items sink naturally).

## Failure modes

- `Could not set lock on file` → another cognee process holds Kuzu. Wait and retry once; never parallelize.
- `LLM API key is not set` → you used a completion search type; retry with `-t CHUNKS`.
- First call in a session is slow (~7s model load) — normal.
