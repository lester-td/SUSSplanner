# Curriculum Plan PDFs

Keep original curriculum plan PDFs here. The parser scans nested directories,
and prerequisite snapshot builds verify included PDFs against the paths and
SHA-256 hashes in `../../reviews/curriculum-plans.json`.

Organize sources by study level and mode, retaining stable filenames:

```text
graduate_studies/<programme>.pdf
undergraduate/full-time/<programme>.pdf
undergraduate/part-time/<programme>.pdf
```

Keep included sources tracked in Git so deployment builds can reproduce the
approved evidence. Replacing or moving a source requires registry reconciliation
and review before publication. OCR copies and generated exports belong under
`scraper/data/output/curriculum/`; leave source PDFs unchanged.

See the [prerequisite review workflow](../../../../docs/PrerequisiteTrees.md).
