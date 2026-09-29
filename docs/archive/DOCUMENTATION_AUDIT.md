# Wilsify AI — Documentation Audit (Archived)

> **Superseded** by the July 2026 documentation reorganization (see [docs/README.md](../README.md)), which moved every file listed as "moved to docs/" or "merged" below into topic subfolders (`architecture/`, `deployment/`, `development/`, `product/`, `releases/`, `archive/`). Kept for historical reference only.

**Audited**: June 2026  
**Total files found**: 24 markdown files  
**Outcome**: All files resolved (moved, merged, archived, or retained)

---

## Audit Summary

| Action | Count |
|--------|-------|
| Retained in place (subpackage docs) | 2 |
| Moved to `docs/` (1:1) | 8 |
| Merged into consolidated docs | 7 (→ 4 merged docs) |
| Archived to `docs/archive/phase-reports/` | 4 |
| Deleted (originals superseded by docs/ versions) | 20 |
| **Total resolved** | **24** |

---

## File-by-File Decisions

### Retained in Place

| File | Decision | Reason |
|------|----------|--------|
| `README.md` (root) | **Retained + updated** | Project-level README; updated to link to `docs/` |
| `mobile-rn/README.md` | **Retained in subpackage** | Developer quickstart for the mobile subpackage — belongs at the subpackage root |

---

### Moved to `docs/` (1:1)

| Source File | Destination | Notes |
|-------------|-------------|-------|
| `MONITORING_REPORT.md` | `docs/MONITORING.md` | Minor header cleanup |
| `PERFORMANCE_REPORT.md` | `docs/PERFORMANCE.md` | Minor header cleanup |
| `DATABASE_MIGRATION_REPORT.md` | `docs/DATABASE.md` | Minor header cleanup |
| `ENVIRONMENT_VALIDATION_REPORT.md` | `docs/ENVIRONMENT.md` | Minor header cleanup |
| `EAS_AUDIT_REPORT.md` | `docs/EAS.md` | + OTA update command |
| `STORE_ASSETS_CHECKLIST.md` | `docs/STORE_ASSETS.md` | Verbatim |
| `BETA_RELEASE_CHECKLIST.md` | `docs/BETA_CHECKLIST.md` | + Phase 6 ✅ Done markers |
| `BETA_GO_LIVE_REPORT.md` | `docs/BETA_LAUNCH.md` | + iOS IAP description updated |

---

### Merged into Consolidated Docs

| Source Files | Merged Into | Merge Strategy |
|-------------|-------------|---------------|
| `SECURITY_AUDIT.md` + `SECURITY_HARDENING_REPORT.md` | `docs/SECURITY.md` | Phase 5 hardening as base; added known issues/accepted risks from Phase 4 audit |
| `PAYMENTS_AUDIT_REPORT.md` + `PAYMENT_INTEGRATION_REPORT.md` | `docs/PAYMENTS.md` | Phase 6 integration as current status + provider implementation details from Phase 5 |
| `NOTIFICATIONS_REPORT.md` + `PUSH_NOTIFICATION_REPORT.md` | `docs/NOTIFICATIONS.md` | Phase 6 (COMPLETE) as base; added DB model, backend endpoints, notification types from Phase 5 |
| `DEPLOYMENT_GUIDE.md` + `PRODUCTION_DEPLOYMENT_GUIDE.md` + `DEPLOYMENT_VALIDATION_REPORT.md` | `docs/DEPLOYMENT.md` | PRODUCTION_DEPLOYMENT_GUIDE as primary; CI/CD from DEPLOYMENT_GUIDE; validation blockers from DEPLOYMENT_VALIDATION_REPORT |

---

### Archived to `docs/archive/phase-reports/`

| Source File | Archived As | Reason |
|------------|-------------|--------|
| `PHASE4_REPORT.md` | `docs/archive/phase-reports/PHASE4_REPORT.md` | Historical phase completion report; current docs supersede it |
| `BETA_READINESS_REPORT.md` | `docs/archive/phase-reports/BETA_READINESS_REPORT.md` | Phase 3 status snapshot; current docs supersede it |
| `HANDOVER.md` | `docs/HANDOVER.md` | Updated/condensed; original deleted |

---

### Deleted (Originals Superseded)

All 20 original root-level markdown files were deleted after their content was moved or merged into `docs/`:

```
DEPLOYMENT_GUIDE.md
DEPLOYMENT_VALIDATION_REPORT.md
PRODUCTION_DEPLOYMENT_GUIDE.md
SECURITY_AUDIT.md
SECURITY_HARDENING_REPORT.md
PAYMENTS_AUDIT_REPORT.md
PAYMENT_INTEGRATION_REPORT.md
NOTIFICATIONS_REPORT.md
PUSH_NOTIFICATION_REPORT.md
MONITORING_REPORT.md
PERFORMANCE_REPORT.md
DATABASE_MIGRATION_REPORT.md
ENVIRONMENT_VALIDATION_REPORT.md
EAS_AUDIT_REPORT.md
STORE_ASSETS_CHECKLIST.md
BETA_RELEASE_CHECKLIST.md
BETA_GO_LIVE_REPORT.md
HANDOVER.md
BETA_READINESS_REPORT.md
PHASE4_REPORT.md
```

---

## Content Quality Notes

- **Duplicates found**: 4 sets of overlapping documents (Security × 2, Payments × 2, Notifications × 2, Deployment × 3)
- **Outdated content retained**: Phase 4 report shows phases 2–8 as pending (they are now complete) — archived with a note rather than corrected
- **iOS IAP API corrected**: One source doc used `requestSubscription` (removed in react-native-iap v15) — corrected to `requestPurchase` in `docs/PAYMENTS.md` and `docs/BETA_LAUNCH.md`
- **Links fixed**: All internal cross-references updated to use relative paths within `docs/`
