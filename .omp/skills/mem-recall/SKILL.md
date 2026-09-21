---
name: mem-recall
description: Query the project's cognee knowledge graph for prior context, decisions, fixes, and domain knowledge. Trigger: /skill:mem-recall, "recall", "what do we know about", "check memory".
when_to_use: Before non-trivial work — check if memory already covers the question.
user-invocable: true
disable-model-invocation: false
---

# mem recall

```bash
~/Desktop/cognee/bin/mem recall "<specific query>"
# or explicit dataset:
~/Desktop/cognee/bin/cog <project> recall "<query>" -t CHUNKS
```

- Query with concrete nouns: ticket IDs, file names, feature names.
- Keyless mode: `-t CHUNKS` is mandatory (completion types need an LLM key).
- KNOWN LIMITATION (cognee 1.6.0): recall is GLOBAL across datasets — results
  may include other projects' chunks. Attribute hits by `dataset_name` /
  `document_name` in the output. Cross-project bleed is expected.
- Empty results → proceed without memory; don't retry more than once.
