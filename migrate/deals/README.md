# Deal Migration

This script migrates all `deals` under every customer to the new deal schema and
renames each deal doc ID to the 4‑digit numeric `dealId`.

## What it does
- Reads every customer document.
- Reads each `customers/{customerId}/deals/{dealDocId}`.
- Uses existing `dealId` (4 digits) if present, otherwise generates a new 4‑digit ID.
- Writes the new schema to a new doc with `dealId` as the document ID.
- Copies all subcollections (visits, measurements, quotations, etc.).
- Writes a map file `deal-id-map.json`.

## What it does NOT do (yet)
- Update cross‑collection references that store the deal doc ID.
  Use the ID map for follow‑up migrations in other collections.

## Run
From repo root:

```powershell
node migrate/deals/migrate-deals.js
```

### Flags (env vars)
- `MIGRATE_DRY_RUN` (default: true). Set to `false` to write changes.
- `MIGRATE_DELETE_OLD` (default: false). Set to `true` to delete old docs after copy.

Example:
```powershell
$env:MIGRATE_DRY_RUN="false"
$env:MIGRATE_DELETE_OLD="false"
node migrate/deals/migrate-deals.js
```

## Output
- `migrate/deals/deal-id-map.json` with `{ customerId, oldId, newId }` entries.

## Notes
- If the old doc ID is already a 4‑digit number, it is reused.
- If a duplicate 4‑digit ID exists within the same customer, a new one is generated.
