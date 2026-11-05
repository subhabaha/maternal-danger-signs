# Contributing

Contributions are welcome, especially from clinicians, ANMs, ASHAs and public-health teams.

- **Rules live in `data/*.json`.** Every rule must cite a public source in the `sources` table. Changes to thresholds need a citation and, ideally, review by an obstetrician.
- **New languages:** add keywords to `SYMPTOM_WORDS` and `STAGE_WORDS` in `src/index.js` and `label_<lang>` / `action_<lang>` fields to the rules, with tests in `test/`.
- **Safety direction:** when unsure, prefer an extra alert over a missed one. Never add output that tells a woman she is "fine" or "normal".
- Run `npm test` before opening a pull request.

By contributing you agree that your contribution is licensed under the Apache License 2.0.
