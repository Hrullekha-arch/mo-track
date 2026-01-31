# DealProducts Migration

This script migrates legacy deal products into the new top-level
`dealProducts/{dealId}` document schema.

## Sources handled
- `customers/{customerId}/deals/{dealId}.products` (legacy array field)
- `customers/{customerId}/deals/{dealId}/products/*` (legacy subcollection)

## What it does
- Builds a new `dealProducts/{dealId}` doc for every deal with legacy products.
- Maps legacy `DealProduct` entries into the new `sections.NORMAL` and `sections.VAS` items.
- Writes a report file with counts per deal.
- Optionally deletes the legacy `products` field and `products` subcollection.

## Run
From repo root:

```powershell
node migrate/deal-products/migrate-deal-products.js
```

### Flags (env vars)
- `MIGRATE_DRY_RUN` (default: true). Set to `false` to write changes.
- `MIGRATE_DELETE_OLD` (default: false). Set to `true` to delete legacy products after copy.
- `MIGRATE_OVERWRITE` (default: false). Set to `true` to overwrite existing `dealProducts` docs.

Example:
```powershell
$env:MIGRATE_DRY_RUN="false"
$env:MIGRATE_DELETE_OLD="true"
node migrate/deal-products/migrate-deal-products.js
```

## Output
- `migrate/deal-products/deal-products-report.json`

## Notes
- If a `dealProducts/{dealId}` doc already exists, the script skips it unless
  `MIGRATE_OVERWRITE=true`.
- Legacy items without enough data will still be migrated, with missing fields omitted.
