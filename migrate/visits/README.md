# Visit Migration

This script migrates all visit documents under every deal to the new visit
schema while keeping legacy fields for compatibility. It does not change the
visit document IDs.

## What it does
- Reads every `customers/{customerId}/deals/{dealId}/visits/{visitId}` doc.
- Adds new schema fields (visitId, visitNo, customerSnapshot, dealSnapshot, etc.).
- Keeps legacy fields (typeOfVisit, dueDate, assignedTo, slotDate, etc.).
- Writes a `visit-id-map.json` file with basic references.

## Run
From repo root:

```powershell
node migrate/visits/migrate-visits.js
```

### Flags (env vars)
- `MIGRATE_DRY_RUN` (default: true). Set to `false` to write changes.

Example:
```powershell
$env:MIGRATE_DRY_RUN="false"
node migrate/visits/migrate-visits.js
```

## Output
- `migrate/visits/visit-id-map.json` with `{ customerId, dealDocId, visitId, visitNo }`.
