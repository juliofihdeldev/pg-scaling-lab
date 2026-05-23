# PostgreSQL Scaling Lab — Accomplishments Summary

**Lesson:** [NextWork — PostgreSQL Scaling Lab](https://learn.nextwork.org/projects/2f1f31d3-2209-4f90-9aa1-c7ae1c2261b1)  
**Project:** `pg-scaling-lab`  
**Stack:** Docker Compose · PostgreSQL 17 · PgBouncer

---

## Overview

You built a production-style PostgreSQL scaling environment from scratch — the same architectural pattern teams use when running Postgres at large scale. The lab walks through three core scaling techniques and ends with a **Secret Mission** that ties them together into a read/write split using connection strings alone.

By the end, you had a multi-node cluster with replication, connection pooling, table partitioning, and separate write/read poolers — then cleaned up all Docker resources when finished.

---

## What You Built

```
                         ┌─────────────────┐
                         │   Application   │
                         │   or psql       │
                         └────────┬────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │ writes (5433)           │ reads (5436)            │ direct access
        ▼                         ▼                         ▼
 ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
 │  pgbouncer   │          │pgbouncer-read│          │  pg-primary  │
 │  port 5433   │          │  port 5436   │          │  port 5432   │
 └──────┬───────┘          └──────┬───────┘          └──────┬───────┘
        │                         │ round-robin               │
        ▼                         ▼                           │ WAL stream
 ┌──────────────┐          ┌──────────────┐                   │
 │  pg-primary  │─────────►│ pg-replica-1 │◄──────────────────┤
 │  port 5432   │          │  port 5434   │                   │
 └──────────────┘          └──────────────┘                   │
        │                  ┌──────────────┐                   │
        └─────────────────►│ pg-replica-2 │◄──────────────────┘
                           │  port 5435   │
                           └──────────────┘
```

| Service          | Port | Role                                      |
| ---------------- | ---- | ----------------------------------------- |
| `pg-primary`     | 5432 | Writes and source of truth                |
| `pg-replica-1`   | 5434 | Read replica                              |
| `pg-replica-2`   | 5435 | Read replica                              |
| `pgbouncer`      | 5433 | Write pooler → primary                    |
| `pgbouncer-read` | 5436 | Read pooler → replicas (round-robin)      |

---

## Lesson 1 — Streaming Replication

**Goal:** Set up a primary with two read replicas and verify real-time WAL streaming.

### What you did

- Configured the primary with replication settings in `init-primary.sh`:
  - `wal_level = replica`
  - `max_wal_senders` and `max_replication_slots`
  - `hot_standby = on`
- Created a dedicated `replicator` user with least-privilege access
- Bootstrapped replicas with `pg_basebackup` in `init-replica.sh`, including:
  - Streaming WAL during backup (`-X stream`)
  - Automatic standby config (`-R`)
  - Named replication slots (`-C`, `-S`)
- Fixed replica startup to run Postgres as the `postgres` user (not root)
- Loaded test data (`employees` table) and verified rows appeared on replicas

### What you learned

- **WAL (Write-Ahead Log)** is the foundation for both crash recovery and replication
- Replicas are read-only standbys that tail the primary's WAL stream
- Replication is **eventually consistent** — replicas lag slightly behind the primary
- Replication does **not** replace backups — mistakes like `DROP TABLE` replicate too
- Monitor replication with `pg_stat_replication` and `pg_replication_slots`

### Skills demonstrated

- Primary/replica topology design
- Physical replication bootstrap with `pg_basebackup`
- Verifying write/read split across nodes
- Troubleshooting replica container failures

---

## Lesson 2 — Connection Pooling with PgBouncer

**Goal:** Configure PgBouncer in transaction mode and reduce backend connection pressure.

### What you did

- Added `pgbouncer` service to `docker-compose.yml` pointing at the primary
- Configured **transaction pooling mode** (`POOL_MODE: transaction`)
- Set pool limits: `MAX_CLIENT_CONN: 200`, `DEFAULT_POOL_SIZE: 20`
- Connected through port **5433** and verified queries worked through the pooler

### What you learned

- Each Postgres connection consumes server memory — web apps can exhaust the limit quickly
- PgBouncer multiplexes many client connections onto fewer server connections
- **Transaction mode** holds a server connection only for the duration of a transaction
- Pooling and replication solve **different** problems — production systems use both

### Skills demonstrated

- PgBouncer configuration via Docker environment variables
- Understanding when to pool vs connect directly
- Verifying end-to-end connectivity through a pooler

---

## Lesson 3 — Table Partitioning

**Goal:** Implement declarative range partitioning, verify partition pruning, and manage partition lifecycle.

### What you did

- Created a partitioned `orders` table keyed on `order_date` (range partitioning)
- Built monthly partitions for January–June 2025 (`orders_2025_01` through `orders_2025_06`)
- Added a `orders_default` partition to catch rows outside defined ranges
- Inserted **100,000 rows** of synthetic order data across six months
- Queried partition distribution with `tableoid::regclass` to see row counts per partition
- Added a **July 2025 partition** (`orders_2025_07`) after resolving the default-partition conflict

### What you learned

- Partition keys must be part of any primary key or unique constraint on partitioned tables
- Postgres routes inserts to the correct partition automatically based on the partition key
- **Partition pruning** lets the planner skip irrelevant partitions on filtered queries
- When a `DEFAULT` partition exists, you must **move matching rows out** before adding a new partition for that date range
- Partitioning helps manage large tables over time (drop old months, add new ones)

### Skills demonstrated

- Declarative range partitioning by date
- Bulk data generation with `generate_series`
- Partition lifecycle management (adding new monthly partitions)
- Debugging the "default partition constraint violated" error

---

## Secret Mission — Read/Write Splitting

**Goal:** Route writes to the primary and reads to replicas using separate connection strings — no application logic required.

### What you did

- Created `pgbouncer-read.ini` with a custom database entry targeting **both replicas**:
  ```ini
  scalinglab = host=pg-replica-1,pg-replica-2 port=5432 dbname=scalinglab
  ```
- Enabled `server_round_robin = 1` for load distribution across replicas
- Added `pgbouncer-read` service to Docker Compose on port **5436**
- Verified writes through the write pooler (5433) and reads through the read pooler (5436)

### What you learned

- Production apps often split reads and writes using **different connection endpoints**
- One pooler in front of the primary handles writes; another in front of replicas handles reads
- Round-robin distributes read load across multiple replicas
- This pattern scales read throughput without changing application query logic — only the connection string

### Skills demonstrated

- Custom PgBouncer INI configuration
- Multi-backend read pooler setup
- End-to-end read/write split verification

---

## Files You Created or Modified

| File                 | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `docker-compose.yml` | Full stack: primary, 2 replicas, write + read poolers  |
| `init-primary.sh`    | WAL replication config and `replicator` user           |
| `init-replica.sh`    | `pg_basebackup` clone and standby startup              |
| `pgbouncer-read.ini` | Read pooler config with round-robin across replicas    |
| `sql.sql`            | Test data, partitioning DDL, and bulk inserts          |
| `REVIEW.md`          | Post-lesson reference guide                            |

---

## Problems You Solved Along the Way

| Issue | Root cause | Resolution |
| ----- | ---------- | ---------- |
| Replica connection refused (port 5434) | Replica containers crashed on startup | Fixed `init-replica.sh` to run Postgres via `gosu postgres` and `chown` data after backup |
| `sql.sql` syntax error on `PGPASSWORD` | Shell commands mixed into SQL file | Moved connect commands to SQL comments |
| `employees` already exists | Re-running `CREATE TABLE` | Used `CREATE TABLE IF NOT EXISTS` / `DROP TABLE` |
| July partition creation failed | 273 rows with `order_date = 2025-07-01` stuck in `orders_default` | Moved rows out of default partition, then created `orders_2025_07` |

---

## Key Concepts — Quick Reference

| Concept | One-line summary |
| ------- | ---------------- |
| WAL | Sequential log written before data changes; enables recovery and replication |
| Streaming replication | Primary pushes WAL to replicas over a persistent connection |
| Read replica | Read-only copy that scales SELECT throughput |
| Replication lag | Delay between a write on primary and visibility on replica |
| PgBouncer | Connection pooler that multiplexes client connections |
| Transaction pooling | Server connection held only for one transaction, then returned |
| Range partitioning | Split a table by value ranges (e.g. monthly on `order_date`) |
| Partition pruning | Query planner skips partitions that cannot contain matching rows |
| Default partition | Catches rows that do not fit any defined partition |
| Read/write split | Separate connection strings for writes (primary) and reads (replicas) |

---

## Cleanup

When the lab was complete, all Docker resources were removed:

```bash
docker compose down -v
```

This stopped and removed all containers (`pg-primary`, `pg-replica-1`, `pg-replica-2`, `pgbouncer`, `pgbouncer-read`), deleted data volumes, and freed ports 5432–5436.

To restart the lab from scratch:

```bash
docker compose up -d
```

---

## What This Maps To in Production

The patterns you practiced here appear in real deployments at scale:

- **AWS RDS / Aurora** — managed read replicas with automatic failover options
- **Patroni / repmgr** — automatic failover when the primary goes down
- **PgBouncer on RDS Proxy or sidecar** — connection pooling in Kubernetes or EC2
- **Citus / sharding** — next step when a single primary cannot handle write volume
- **Application-level routing** — ORMs and drivers with separate read/write pools

You now understand the **why** behind each layer — not just how to click through a tutorial.

---

## Related Documents

- [REVIEW.md](./REVIEW.md) — Detailed reference guide with commands, self-test quiz, and troubleshooting
- [Lesson on NextWork](https://learn.nextwork.org/projects/2f1f31d3-2209-4f90-9aa1-c7ae1c2261b1) — Original step-by-step project guide

---

*Completed: May 2026*
