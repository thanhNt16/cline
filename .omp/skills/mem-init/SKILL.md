---
name: mem-init
description: Initialize the cognee memory layer for the current project — registers the dataset, installs the cognee-memory skill, writes .mcp.json, creates the staging dir. Trigger: /skill:mem-init, "init memory", "setup memory layer".
when_to_use: First time working in a project that should have persistent memory.
user-invocable: true
disable-model-invocation: false
---

# mem init

Run from the project root:

```bash
~/Desktop/cognee/bin/mem init
```

Registers `p-<project>` in `~/Desktop/cognee/DATASETS.md`, installs the
`cognee-memory` skill into `.omp/skills/`, writes `.mcp.json` (cognee stdio
MCP server), and creates `~/Desktop/cognee/staging/<project>/`.

After init: run `/skill:mem-ingest`, then start a new omp session — the skill
and MCP tools are live from the next session.
