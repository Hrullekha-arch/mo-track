# Purchase + Inbound Snapshot Migration

Backfills old documents in:
- `purchaseRequests`
- `inbounds`

## What It Migrates

### On `purchaseRequests`
- `customerSnapshot`
- `dealSnapshot`
- `orderSnapshot`
- `assignedSalesman`
- `stockDetails` with:
  - `bcn`
  - `qty`
  - `unit`
  - `vendorName`
  - `supplierCollectionCode`
  - `supplierCollectionName`
- Missing line-level fields are also filled on `fabricDetails` / `furnitureDetails`:
  - `unit`, `itemCode`, `vendorName`, `supplierCollectionCode`, `supplierCollectionName`
- If line has `docketNo`, it is preserved in PR line and stock details.

### On `inbounds`
- `customerSnapshot`
- `dealSnapshot`
- `orderSnapshot`
- `assignedSalesman`
- `stockDetails` with required fields above
- Line-level `items[]` fields normalized/fill:
  - `itemCode`, `unit`, `vendorName`, `supplierCollectionCode`, `supplierCollectionName`
  - `expectedDeliveryDate`
  - `stockDetail`
  - `docketNo`

### Docket Number Backfill
- If `purchaseRequests.fabricDetails[]` (or furniture line) has `docketNo` and `poNumber`,
  matching inbound item (same PO + BCN) gets that `docketNo`.

## Run

From repo root:

```powershell
node migrate/purchase/migrate-pr-inbound-snapshots.js
```

## Env Flags

- `MIGRATE_DRY_RUN`
  - Default: `true`
  - Set `false` to write updates
- `MIGRATE_WRITE_REPORT`
  - Default: `true`
  - Set `false` to skip report file
- `MIGRATE_LIMIT`
  - Default: `0` (no limit)
  - Set to a number for testing on first N docs
- `MIGRATE_SCAN_PAGE_SIZE`
  - Default: `500`
  - Read page size per query (use lower number if your dataset is very large)

Example dry run for first 50 docs:

```powershell
$env:MIGRATE_DRY_RUN="true"
$env:MIGRATE_LIMIT="50"
node migrate/purchase/migrate-pr-inbound-snapshots.js
```

Example live run:

```powershell
$env:MIGRATE_DRY_RUN="false"
$env:MIGRATE_LIMIT="0"
node migrate/purchase/migrate-pr-inbound-snapshots.js
```

## Output

- `migrate/purchase/purchase-inbound-snapshot-report.json`
