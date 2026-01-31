# Inventory Migration

This script migrates existing stock master and length documents to the new
inventory schema, using deterministic length IDs.

## What it does
- Reads every doc in `stocks`.
- Rewrites master fields to new schema (itemId, name, totals, etc.).
- Migrates length docs to `lengthId = <bcn>_<lengthNo>` (numeric suffix).
- Recomputes totals (totalQty/availableQty/etc.) from lengths when present.
- Writes an ID map to `inventory-id-map.json`.

## Run
From repo root:

```powershell
node migrate/inventory/migrate-inventory.js
```

### Flags (env vars)
- `MIGRATE_DRY_RUN` (default: true). Set to `false` to write changes.
- `MIGRATE_DELETE_OLD` (default: false). Set to `true` to delete old length docs after migration.

Example:
```powershell
$env:MIGRATE_DRY_RUN="false"
$env:MIGRATE_DELETE_OLD="false"
node migrate/inventory/migrate-inventory.js
```

## Output
- `migrate/inventory/inventory-id-map.json` with `{ bcn, oldLengthId, newLengthId }`.
