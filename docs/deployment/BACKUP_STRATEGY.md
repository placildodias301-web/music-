# Wilsify AI — Backup Strategy

## 1. PostgreSQL

### Daily Automated Backups (Railway)

Railway Pro includes automated daily backups with a 7-day retention window. To verify:

1. Dashboard → Project → Settings → Backups
2. Confirm "Daily Backups" toggle is ON
3. Test restore at least once before launch: click any backup → Restore to new service

### Manual Point-in-Time Backup (before major deploys)

```bash
# Connect to the Railway Postgres plugin, then run:
pg_dump $DATABASE_URL --format=custom --compress=9 \
  --file=wilsify_$(date +%Y%m%d_%H%M%S).dump

# Upload to R2 / S3 for offsite retention
rclone copy wilsify_*.dump r2:wilsify-backups/db/
```

### Recommended Production Setup

| Layer | Tool | Retention |
|---|---|---|
| Automated daily | Railway built-in | 7 days |
| Weekly offsite | pg_dump → R2 | 90 days |
| Pre-deploy | Manual pg_dump | Until next release |

### Restore Procedure

```bash
# Restore to a new database (never restore over live production directly)
pg_restore --no-owner --no-acl --dbname=$NEW_DATABASE_URL wilsify_20260626.dump
```

---

## 2. Redis

Redis stores two categories of data:
- **BullMQ job queue** — analysis jobs, scheduler jobs (in flight)
- **Rate-limit counters** — ephemeral, rebuilds itself on restart

### Persistence (AOF)

Enable AOF persistence directly in `redis.conf` (or via `redis-cli config set appendonly yes` for local dev):

```conf
appendonly yes
appendfsync everysec
```

This ensures queued jobs survive a Redis container restart. No manual backup of Redis is required for production — Railway Redis restarts with data intact.

### What is NOT in Redis

All durable application state (users, songs, analyses, credits, subscriptions) is in PostgreSQL. Redis loss only affects:
- Jobs currently in queue (will be re-submitted by the user or auto-retried)
- Rate-limit counters (resets to zero — acceptable)

---

## 3. Cloudflare R2 Object Storage

R2 stores all user-uploaded audio files, generated MIDI, PDFs, and stems.

### Current Risk

R2 does **not** have versioning or cross-region replication by default. A deleted or corrupted object is unrecoverable.

### Recommended Configuration

```bash
# Enable object versioning via Wrangler CLI
wrangler r2 bucket create wilsify-uploads --storage-class Standard

# Create a lifecycle rule to expire old versions after 90 days
wrangler r2 bucket lifecycle put wilsify-uploads \
  --rule '{"id":"expire-old","status":"Enabled","expiration":{"days":90}}'
```

### Offsite Sync (monthly)

```bash
# Mirror R2 bucket to S3 Glacier for cold storage
rclone sync r2:wilsify-uploads s3:wilsify-cold-backup \
  --s3-storage-class GLACIER \
  --transfers 16
```

### Critical Files to Prioritise

| Path pattern | Content | Priority |
|---|---|---|
| `uploads/{userId}/{uuid}.mp3` | Original audio | HIGH |
| `analyses/{songId}/midi.mid` | Generated MIDI | MEDIUM |
| `analyses/{songId}/sheet.pdf` | Sheet music PDF | MEDIUM |
| `analyses/{songId}/stems/*` | Separated stems | MEDIUM |

---

## 4. Pre-Launch Backup Checklist

- [ ] Railway automated backups enabled and verified
- [ ] Manual full dump taken and restored to a test DB successfully
- [ ] R2 versioning evaluated and configured if budget allows
- [ ] On-call runbook updated with restore procedure URL
- [ ] Redis AOF confirmed active (`redis-cli CONFIG GET appendonly` → `yes`)
- [ ] Backup monitoring alert configured (email/Slack if backup job fails)

---

## 5. Recovery Time Objectives

| Scenario | Target RTO | Procedure |
|---|---|---|
| Single record deleted | < 1 hour | pg_restore specific table to temp DB, copy row |
| Accidental table drop | < 2 hours | Restore from most recent daily backup |
| Full DB loss | < 4 hours | Restore from Railway automated backup |
| R2 object deleted | Not recoverable unless versioning enabled | Enable versioning before launch |
| Redis full loss | < 10 min | Restart Redis with AOF — jobs re-queue from user |

---

## Related Documents

- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment this backup strategy protects
- [../architecture/DATABASE.md](../architecture/DATABASE.md) — the schema being backed up
- [../README.md](../README.md) — documentation map
