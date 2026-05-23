# Lessons Link - https://learn.nextwork.org/projects/2f1f31d3-2209-4f90-9aa1-c7ae1c2261b1

# PostgreSQL Scaling Lab — Review Guide

Use this document after completing the lessons to reinforce what you learned and as a quick reference when working with scaled Postgres setups.

---

## What This Lab Covers

This project demonstrates three foundational techniques for scaling PostgreSQL:

1. **Streaming replication** — keep copies of your data in sync with the primary
2. **Read scaling** — offload read queries to replica nodes
3. **Connection pooling** — reduce connection overhead with PgBouncer

These are building blocks used in production systems before (or alongside) more advanced patterns like sharding, Citus, or managed services like RDS read replicas.

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │   Your App      │
                    │   or psql       │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │ writes          │ reads           │ pooled writes
           ▼                 ▼                 ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │  pg-primary  │  │ pg-replica-1 │  │  pgbouncer   │
   │  port 5432   │  │  port 5434   │  │  port 5433   │
   └──────┬───────┘  └──────────────┘  └──────┬───────┘
          │ WAL stream              ┌──────────────┐
          ├────────────────────────►│ pg-replica-2 │
          │                         │  port 5435   │
          └────────────────────────►└──────────────┘
```

| Service        | Host Port | Purpose                                   |
| -------------- | --------- | ----------------------------------------- |
| `pg-primary`   | 5432      | All writes; source of truth               |
| `pg-replica-1` | 5434      | Read-only copy of primary data            |
| `pg-replica-2` | 5435      | Second read-only copy                     |
| `pgbouncer`    | 5433      | Connection pooler in front of the primary |

**Credentials (lab only):**

- User: `postgres` / Password: `postgres`
- Replication user: `replicator` / Password: `replicator_pass`
- Database: `scalinglab`

---

## Core Concepts

### Write-Ahead Logging (WAL)

WAL is Postgres's durability mechanism. Before a change is applied to data files, it is written to a sequential log (the WAL). This gives you:

- **Crash recovery** — replay the log after a failure
- **Replication** — replicas tail the WAL to stay in sync

On the primary, `wal_level = replica` tells Postgres to include enough detail in the WAL for streaming replication.

### Primary vs Replica

|                | Primary         | Replica                         |
| -------------- | --------------- | ------------------------------- |
| Writes         | Yes             | No (read-only)                  |
| Reads          | Yes             | Yes                             |
| Data freshness | Always current  | Slightly behind (lag)           |
| Role           | Source of truth | Scale reads, failover candidate |

**Rule of thumb:** route `INSERT`, `UPDATE`, `DELETE`, and DDL to the primary. Route `SELECT` to replicas when slightly stale data is acceptable.

### Streaming Replication

Replicas do not poll for changes. The primary **streams** WAL records over a persistent connection. The lab sets this up with:

1. A `replicator` role on the primary
2. `pg_basebackup` to clone the primary's data directory onto each replica
3. Automatic standby configuration (`-R` flag) so the replica knows where to connect

### Replication Slots

Each replica creates a named slot (e.g. `replica_slot_pg_replica_1`). Slots prevent the primary from discarding WAL segments that a lagging replica still needs. Trade-off: a disconnected replica can cause WAL to accumulate on the primary.

### Connection Pooling (PgBouncer)

Each Postgres connection uses memory on the server. Web apps that open a connection per request can exhaust the connection limit quickly.

PgBouncer sits between clients and Postgres:

- Many client connections → fewer server connections
- This lab uses `POOL_MODE: transaction` — a server connection is held only for the duration of a transaction, then returned to the pool

---

## File Reference

| File                 | What it does                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| `docker-compose.yml` | Defines primary, two replicas, and PgBouncer                            |
| `init-primary.sh`    | Enables WAL replication, creates `replicator` user, opens `pg_hba.conf` |
| `init-replica.sh`    | Waits for primary, runs `pg_basebackup`, starts Postgres as a standby   |
| `sql.sql`            | Sample schema and data (`employees` table) for testing replication      |

### Primary init highlights (`init-primary.sh`)

```bash
wal_level = replica          # WAL detail needed for replication
max_wal_senders = 10         # Max concurrent replication connections
max_replication_slots = 10   # Max named replication slots
hot_standby = on             # Allow reads on replicas while recovering
```

### Replica init highlights (`init-replica.sh`)

```bash
pg_basebackup \
  -h pg-primary \
  -U replicator \
  -D "$PGDATA" \
  -R              # Write standby config (primary_conninfo)
  -X stream       # Stream WAL during backup
  -C              # Create replication slot
  -S "replica_slot_$(hostname | tr '-' '_')"
  -c fast         # Checkpoint mode
```

---

## Hands-On Commands

### Start and stop the lab

```bash
docker compose up -d          # Start all services
docker compose ps             # Check status
docker compose logs -f        # Follow logs
docker compose down           # Stop (keeps volumes)
docker compose down -v        # Stop and wipe data
```

### Connect to each node

```bash
# Primary (writes)
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d scalinglab

# Replicas (reads)
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d scalinglab
PGPASSWORD=postgres psql -h localhost -p 5435 -U postgres -d scalinglab

# Through PgBouncer (pooled connection to primary)
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d scalinglab
```

### Load test data

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d scalinglab -f sql.sql
```

### Verify replication

On the **primary**:

```sql
-- Connected replicas and their lag
SELECT pid, usename, application_name, client_addr, state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- Replication slots
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
FROM pg_replication_slots;
```

On a **replica**:

```sql
-- Confirm read-only mode
SELECT pg_is_in_recovery();   -- true on replica, false on primary

-- How far behind the primary
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
```

### Test the write/read split

```sql
-- On primary (5432): insert a row
INSERT INTO employees (name, department, salary)
VALUES ('Dana Lee', 'Sales', 68000.00);

-- On replica (5434 or 5435): confirm it appears
SELECT * FROM employees WHERE name = 'Dana Lee';
```

If the row shows up on the replica, streaming replication is working.

---

## Key Takeaways

After completing the lessons, you should be able to explain:

1. **Why replication does not replace backups** — replicas mirror live changes, including mistakes (`DROP TABLE` replicates too). You still need point-in-time backups.

2. **Eventual consistency on replicas** — there is always some lag between a write on the primary and visibility on a replica. Design read paths accordingly.

3. **Pooling vs replication solve different problems** — PgBouncer reduces connection overhead; replicas increase read throughput. You typically use both.

4. **The replication bootstrap sequence** — primary configured → replication user created → `pg_basebackup` clones data → replica streams WAL continuously.

5. **Read-your-writes is not automatic** — if a user writes then immediately reads from a replica, they may not see their own write. Apps often route "just wrote" reads back to the primary.

---

## Common Issues and Fixes

| Symptom                                 | Likely cause                     | What to check                                   |
| --------------------------------------- | -------------------------------- | ----------------------------------------------- |
| Replica container exits immediately     | `pg_basebackup` failed           | `docker compose logs pg-replica-1`              |
| Empty `pg_stat_replication`             | Replicas not connected           | Replica logs, network, `replicator` credentials |
| `FATAL: password authentication failed` | Wrong password or `pg_hba.conf`  | Match credentials in compose and init scripts   |
| Data on primary but not replica         | Replication broken or lagging    | `pg_stat_replication`, replica recovery status  |
| Too many connections                    | App opens connection per request | Route through PgBouncer                         |

To reset everything and re-bootstrap replicas from scratch:

```bash
docker compose down -v
docker compose up -d
```

---

## What Comes Next

This lab covers **single-primary, multi-replica** scaling. Real-world next steps include:

- **Automatic failover** — Patroni, repmgr, or managed cloud failover
- **Read routing in application code** — libraries like `pg` with separate read/write pools
- **Load balancer for replicas** — HAProxy or a proxy that distributes reads
- **Monitoring lag** — alert when `replay_lag` exceeds a threshold
- **Sharding** — split data across multiple primaries when one primary is the bottleneck for writes
- **Vertical scaling** — bigger instance, faster disk, more RAM (simpler but has a ceiling)

---

## Quick Self-Test

Answer these without looking at the docs:

1. What port does the primary listen on? What about the replicas?
2. What does `wal_level = replica` enable?
3. Why do we create a separate `replicator` user instead of using `postgres`?
4. What command clones the primary's data onto a new replica?
5. What is the difference between connecting on port 5432 vs 5433?
6. Can you run `INSERT` on a replica? What happens if you try?
7. What does `pg_is_in_recovery()` return on a replica?
8. Why might an app send reads to the primary right after a write?

<details>
<summary>Answers</summary>

1. Primary: **5432**. Replicas: **5434** and **5435**. PgBouncer: **5433**.
2. WAL records include enough information for **streaming replication** to replicas.
3. **Principle of least privilege** — replication only needs the `REPLICATION` attribute, not full superuser access.
4. **`pg_basebackup`** — performs a physical base backup and (with `-R`) configures the standby.
5. **5432** connects directly to Postgres. **5433** goes through **PgBouncer**, which pools connections to the primary.
6. **No** — replicas are read-only. An `INSERT` will fail with a read-only transaction error.
7. **`true`** — indicates the instance is in recovery mode (a standby/replica).
8. **Read-your-writes consistency** — the replica may not have replayed the WAL yet, so the write might not be visible there.

</details>

---

_Lab repo: `pg-scaling-lab` — Docker Compose, Postgres 17, PgBouncer._

---

## Secret mission — read/write split

Production apps often route writes and reads using **different connection strings**:

- Write pooler (`pgbouncer` :5433) → primary
- Read pooler (`pgbouncer-read` :5436) → replicas (round-robin)

This lab implements that pattern in `docker-compose.yml` and `pgbouncer-read.ini`. The console dashboard and Express API use separate read/write pools in `db.js`.

**You completed:**

- Streaming replication (primary + 2 replicas)
- PgBouncer transaction pooling
- Declarative range partitioning
- Read/write splitting via dual poolers
