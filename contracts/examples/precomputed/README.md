# Precomputed contract examples

These JSON responses are generated from the reviewed Earth Engine result packs
by `scripts/data/build_contract_pack_examples.py`. They are contract-shaped
offline inputs for the browser and API tests; they do not trigger processing.

The generator binds each response to the district boundary checksum, the
Earth Engine scene IDs, the analysis period, method version, threshold, CRS,
quality state, and source metadata. Nagpur built-up uses the approved
constrained-NDBI result; the built-IBI run remains attached as sensitivity
evidence rather than replacing the selected source.

Regenerate after an approved pack change, then review `manifest.json` and the
SHA-256 values before committing the generated files.
