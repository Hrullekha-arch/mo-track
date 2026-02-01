# PMS Import Helper

Use this to convert your tab-separated VAS routing sheet into the JSON format
accepted by the PMS “Import JSON” dialog.

## 1) Paste raw table
Create / update:
`migrate/pms/seed-raw.txt`

Paste the exact table data (tab-separated, with header row).

## 2) Convert to JSON
```powershell
node migrate/pms/convert-vas-table.js
```

This will generate:
`migrate/pms/pms-import.json`

## 3) Import in PMS UI
Open `/dashboard/pms` and click **Import JSON** in the relevant tab.

Recommended order:
1. Product Routing (imports products + routing)
2. Machine Master (imports machines)
3. Capability Matrix (imports people + skills)

Downtime is optional and can be imported separately.
