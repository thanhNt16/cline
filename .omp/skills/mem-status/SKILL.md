---
name: mem-status
description: Show the current project's cognee dataset item count. Trigger: /skill:mem-status, "memory status", "how much is ingested".
when_to_use: Quick check that a project's KG exists and is non-empty.
user-invocable: true
disable-model-invocation: false
---

# mem status

```bash
~/Desktop/cognee/bin/mem status
```

Prints `p-<project>` item count from the cognee metadata DB. 0 or missing =
run `/skill:mem-ingest`.
