---
name: mem-remember
description: Store distilled knowledge into the project's cognee dataset — decisions, fixes, invariants, file→purpose maps. Trigger: /skill:mem-remember, "remember this", "save to memory", "store this".
when_to_use: After producing a decision, fix, or discovery worth persisting across sessions.
user-invocable: true
disable-model-invocation: false
---

# mem remember

You are the extractor — distill FIRST, then store. A memory is a decision,
fix, invariant, or map — not a transcript.

```bash
~/Desktop/cognee/bin/mem remember "<distilled text>"
# or explicit dataset:
~/Desktop/cognee/bin/cog <project> remember "<text>"
```

Formats:

```
[decision]  <what> — because <why>. Affects: <files/areas>
[fix]       <symptom> → <root cause> → <fix>. Files: <paths>
[invariant] <rule>. Violated by: <what breaks it>
[map]       <path/module> = <purpose>
```

- One memory per call; batch related facts into one text block.
- File ingest: `cog <proj> remember <path>` — real paths only (nonexistent
  absolute-looking paths are ingested as literal text).
- Session-scoped scratch: add `--session-id <id>` — skips the permanent graph.
- Kuzu single-writer: never run two `cog`/`mem` commands concurrently.
