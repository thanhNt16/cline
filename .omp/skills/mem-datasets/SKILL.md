---
name: mem-datasets
description: List all cognee datasets with item counts across every project. Trigger: /skill:mem-datasets, "list datasets", "all memory".
when_to_use: Overview of which projects have KGs and their sizes.
user-invocable: true
disable-model-invocation: false
---

# mem datasets

```bash
~/Desktop/cognee/bin/mem datasets
```

Prints every `p-*` dataset with item counts, sorted by size. Registry of
project→dataset mappings lives in `~/Desktop/cognee/DATASETS.md`.
