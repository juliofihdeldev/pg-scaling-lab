# Suggested Learning Path

A practical roadmap for scaling backend systems — built around what you've already done in this repo and what to tackle next.

**Legend:** `[x]` done · `[ ]` not started · `[~]` in progress

---

## Progress overview

| Phase | Topic | Status |
| ----- | ----- | ------ |
| 1 | Data layer fundamentals | **Done** |
| 2 | Caching | **Done** |
| 3 | Observability | Not started |
| 4 | High availability | Not started |
| 5 | Async & write decoupling | Not started |
| 6 | Advanced scaling | Not started |

---

## Phase 1 — Data layer fundamentals ✅

*Completed via [NextWork PostgreSQL Scaling Lab](https://learn.nextwork.org/projects/2f1f31d3-2209-4f90-9aa1-c7ae1c2261b1) and this repo.*

- [x] Understand WAL and why replication works
- [x] Set up primary + 2 read replicas (`pg_basebackup`, replication slots)
- [x] Verify write/read split (primary vs replica)
- [x] Configure PgBouncer connection pooling (transaction mode)
- [x] Implement read/write routing with separate poolers (`pgbouncer` + `pgbouncer-read`)
- [x] Implement declarative table partitioning (range by date)
- [x] Manage partition lifecycle (create, seed, detach, query detached partition)
- [x] Build Express API + console dashboard to exercise the stack
- [x] Document accomplishments ([ACCOMPLISHMENTS.md](./ACCOMPLISHMENTS.md))

**Key repo files:** `init-primary.sh`, `init-replica.sh`, `pgbouncer-read.ini`, `partitions.js`

---

## Phase 2 — Caching ✅

*Completed via caching course + Redis integration on branch `caching-with-redis`.*

- [x] Caching course (concepts: TTL, eviction, cache-aside)
- [x] Add Redis to Docker Compose (`:6379`)
- [x] Implement cache-aside on `GET /employees`
- [x] Invalidate cache on writes (`POST /employees`, bulk insert)
- [x] Expose cache stats (hits, misses, hit rate)
- [x] Dashboard panel to demo hit/miss and flush
- [x] Understand `?bypass=1` to skip cache and hit read pool directly
- [x] Connect caching to replication lag (stale reads when invalidation is wrong or TTL is long)

**Key repo files:** `cache.js`, dashboard `[5] CACHE` panel

**Concepts to keep sharp:**
- Cache-aside: app owns cache logic (check → miss → DB → set)
- Writes bust cache; reads prefer memory
- Cache does not replace DB — it reduces load on read path

---

## Phase 3 — Observability

*Know what's happening before you scale further.*

- [ ] Add Prometheus metrics to the API (request latency, cache hit rate, pool usage)
- [ ] Grafana dashboard for replication lag (`replay_lag` from `pg_stat_replication`)
- [ ] Alert when replica lag exceeds a threshold (e.g. > 5s)
- [ ] Log slow queries on primary (`log_min_duration_statement`)
- [ ] Use `EXPLAIN ANALYZE` on partitioned queries — confirm partition pruning
- [ ] PgBouncer stats (`SHOW POOLS`, `SHOW STATS`)

**Suggested project:** Add a `/metrics` endpoint and a simple Grafana compose stack to this repo.

**You'll know you're done when:** You can answer "is the replica lagging?" and "are cache hits helping?" with data, not guesses.

---

## Phase 4 — High availability & failover

*Replicas scale reads; HA keeps writes alive when primary fails.*

- [ ] Understand RTO (recovery time) vs RPO (data loss window)
- [ ] Learn automatic failover tools (Patroni, repmgr) or managed options (RDS Multi-AZ, Aurora)
- [ ] Practice manual failover: promote replica → reconfigure apps
- [ ] Understand split-brain and why quorum matters
- [ ] Backups + PITR (Point-in-Time Recovery) — replication is not backup

**Suggested project:** Simulate primary failure in Docker and document a manual failover runbook.

**You'll know you're done when:** You can explain what happens to in-flight writes if the primary dies at 2am.

---

## Phase 5 — Async processing & write decoupling

*When the database becomes the bottleneck for writes, queue the work.*

- [ ] Message queue basics (Redis Streams, RabbitMQ, or SQS)
- [ ] Outbox pattern — write to DB + event in same transaction
- [ ] Background workers for heavy jobs (bulk email, reports, indexing)
- [ ] Idempotency keys for safe retries
- [ ] Dead-letter queues for failed messages

**Suggested project:** Replace bulk employee insert with "enqueue job → worker writes to DB → invalidate cache."

**You'll know you're done when:** API returns fast while writes happen asynchronously without losing data.

---

## Phase 6 — Advanced scaling

*Tackle when a single primary can't handle writes or data size.*

- [ ] Vertical scaling limits (when bigger instance isn't enough)
- [ ] Read replica load balancing at scale (HAProxy, ProxySQL)
- [ ] Application-level shard routing
- [ ] Citus or Vitess for distributed Postgres
- [ ] CDN + edge caching for static assets and API responses
- [ ] Multi-region replication and disaster recovery

**Suggested project:** Pick one — add HAProxy in front of replicas, or explore Citus with a sharded `orders` table.

---

## Recommended order (visual)

```
[x] Phase 1 — PostgreSQL scaling (this repo)
[x] Phase 2 — Redis caching (caching-with-redis branch)
[ ] Phase 3 — Observability          ← START HERE
[ ] Phase 4 — High availability
[ ] Phase 5 — Async / queues
[ ] Phase 6 — Sharding / multi-region
```

---

## Quick self-check (before moving to Phase 3)

Answer without looking at docs:

1. What port is the write pooler? The read pooler?
2. What happens to cached data when you `POST /employees`?
3. Why can a replica return stale data even with caching disabled?
4. What does `ALTER TABLE orders DETACH PARTITION` do?
5. What's the difference between cache-aside and read-through?

<details>
<summary>Answers</summary>

1. Write pooler **5433**, read pooler **5436**.
2. Cache key is **invalidated** — next read is a miss, fresh data from read pool.
3. **Replication lag** — replica hasn't replayed latest WAL yet.
4. Partition becomes a **standalone table** — parent queries skip its rows; direct queries still work.
5. **Cache-aside:** app checks cache, loads DB on miss, app writes cache. **Read-through:** cache layer loads DB transparently on miss (app always asks cache).

</details>

---

## Related docs in this repo

| File | Purpose |
| ---- | ------- |
| [README.md](./README.md) | Setup, architecture, API |
| [ACCOMPLISHMENTS.md](./ACCOMPLISHMENTS.md) | What you built in the scaling lab |
| [REVIEW.md](./REVIEW.md) | Commands, troubleshooting, quiz |
| [SECURITY.md](./SECURITY.md) | Local-lab-only disclaimer |

---

## Notes

- Check off items as you complete them — copy `[ ]` → `[x]`
- Phase 3 (observability) is the best **next** step: it makes everything after easier to debug
- Keep this file updated when you finish a phase or add a new project to the repo

*Last updated: May 2026*
