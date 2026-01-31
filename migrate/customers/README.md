# Customer Migration

This script migrates all `customers` documents to the new schema and renames
document IDs to `CustomerName_phone` (spaces/symbols removed).

## What it does
- Reads every document in `customers`.
- Builds a new document ID: `<CustomerName>_<PhoneDigits>`.
- Writes the new schema to the new doc.
- Copies all subcollections (e.g., `deals`, `visits`, `quotations`, etc.).
- Writes an ID map to `customer-id-map.json`.

## What it does NOT do (yet)
- Update references in other top-level collections (`orders`, `o2d`, etc.).
  Use the generated ID map for those follow-up migrations.

## Run
From repo root:

```powershell
node migrate/customers/migrate-customers.js
```

### Flags (env vars)
Set these before running:
- `MIGRATE_DRY_RUN` (default: true). Set to `false` to write changes.
- `MIGRATE_DELETE_OLD` (default: false). Set to `true` to delete old docs after copy.

Example:
```powershell
$env:MIGRATE_DRY_RUN="false"
$env:MIGRATE_DELETE_OLD="false"
node migrate/customers/migrate-customers.js
```

## Output
- `migrate/customers/customer-id-map.json` with `oldId -> newId` mapping.

## Notes
- If multiple customers share the same name/phone, the script appends `__1`, `__2`, etc.
- Missing name/phone will fallback to the old document ID.
