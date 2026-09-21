---
name: mem-ingest
description: Ingest the current project's docs, README, and Claude Code/omp session transcripts into its cognee dataset. Trigger: /skill:mem-ingest, "ingest project", "load project knowledge".
when_to_use: After mem-init, or when new docs/sessions should be added to the project KG.
user-invocable: true
disable-model-invocation: false
---

# mem ingest

Run from the project root:

```bash
~/Desktop/cognee/bin/mem ingest
```

Stages session transcripts (Claude Code `~/.claude/projects/` + omp
`~/.omp/agent/sessions/`, matched by cwd-encoding and basename) into
`~/Desktop/cognee/staging/<project>/`, then ingests `docs/`, `README`, and
staged sessions into `p-<project>` in batches of 16.

- Files only — never pass a directory to `remember` (expands to whole repo,
  trips SQL variable limit).
- Kuzu single-writer: no concurrent `cog`/`mem` runs.
- Large repos: source code is NOT ingested by default (docs + sessions only).
  To add code, run `cog <proj> remember <file...>` manually in ≤16-file batches.

Verify with `/skill:mem-status`.
