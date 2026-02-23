# Asset Manifest

Use `scene-asset-manifest.json` to track the sweep status for every planned asset slot.

Required fields per slot:
- `status`
- `sourceUrl`
- `license`
- `attributionRequired`

Suggested status values:
- `pending-source`
- `pending-match`
- `source-validated`
- `imported`
- `integrated`
- `rejected`
