# pg-scaling-lab

A hands-on PostgreSQL scaling environment built with Docker Compose. Practice **streaming replication**, **connection pooling**, **read/write splitting**, **table partitioning**, and an **Express API** with a retro console dashboard.

Based on the [NextWork PostgreSQL Scaling Lab](https://learn.nextwork.org/projects/2f1f31d3-2209-4f90-9aa1-c7ae1c2261b1).

---

## What you'll learn

- **Streaming replication** — primary + 2 read replicas via WAL
- **PgBouncer** — transaction-mode connection pooling
- **Read/write split** — separate poolers for writes (primary) and reads (replicas)
- **Range partitioning** — monthly partitions, detach, and partition pruning
- **Production patterns** — route reads and writes using connection strings alone

---

## Architecture

```
                         ┌─────────────────┐
                         │  Console UI     │
                         │  :3000          │
                         └────────┬────────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │ writes              │ reads                │
           ▼                     ▼                      │
    ┌──────────────┐      ┌──────────────┐              │
    │  pgbouncer   │      │pgbouncer-read│              │
    │  :5433       │      │  :5436       │              │
    └──────┬───────┘      └──────┬───────┘              │
           │                     │ round-robin          │
           ▼                     ▼                      │
    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │  pg-primary  │─────►│ pg-replica-1 │      │ pg-replica-2 │
    │  :5432       │ WAL  │  :5434       │      │  :5435       │
    └──────────────┘      └──────────────┘      └──────────────┘
```

| Service          | Port | Role                              |
| ---------------- | ---- | --------------------------------- |
| `pg-primary`     | 5432 | Writes — source of truth          |
| `pg-replica-1`   | 5434 | Read replica                      |
| `pg-replica-2`   | 5435 | Read replica                      |
| `pgbouncer`      | 5433 | Write pooler → primary            |
| `pgbouncer-read` | 5436 | Read pooler → replicas            |
| `api`            | 3000 | Express API + console dashboard   |

**Credentials (lab only):**

| Setting    | Value            |
| ---------- | ---------------- |
| User       | `postgres`       |
| Password   | `postgres`       |
| Database   | `scalinglab`     |
| Replicator | `replicator_pass`|

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) 18+ (optional — only if running the API outside Docker)

---

## Quick start

```bash
# Clone and start the full stack
git clone https://github.com/juliofihdeldev/pg-scaling-lab.git
cd pg-scaling-lab
docker compose up -d --build

# Open the console dashboard
open http://localhost:3000
```

Verify replication:

```bash
# Write on primary
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d scalinglab \
  -c "INSERT INTO employees (name, department, salary) VALUES ('Test User', 'Engineering', 80000);"

# Read from replica
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d scalinglab \
  -c "SELECT * FROM employees WHERE name = 'Test User';"
```

---

## Console dashboard

The dashboard at **http://localhost:3000** is a terminal-style UI with four panels:

| Panel          | What it does                                              |
| -------------- | --------------------------------------------------------- |
| **Overview**   | Write/read pool status, architecture, live metrics        |
| **Employees**  | Insert rows, bulk generate (10K / 100K / 1M), view table  |
| **Partitions** | 4-step partition lab — setup, seed, detach, query         |
| **Replication**| Write-then-read test to verify WAL streaming              |

Run the API locally (with Docker DB stack running):

```bash
npm install
npm start        # or: npm run dev
```

When running outside Docker, the API connects to `localhost:5433` (write) and `localhost:5436` (read) by default.

---

## API reference

| Method | Endpoint                    | Pool  | Description                        |
| ------ | --------------------------- | ----- | ---------------------------------- |
| GET    | `/health`                   | —     | Health check                       |
| GET    | `/db/status`                | both  | Primary vs replica info            |
| GET    | `/employees`                | read  | List employees (last 50 + total)   |
| POST   | `/employees`                | write | Insert one employee                |
| POST   | `/employees/bulk`           | write | Bulk insert `{ "amount": "10k" }`  |
| GET    | `/test/replication`         | both  | Replication smoke test             |
| POST   | `/partitions/setup`         | write | Create 6-month partitioned table   |
| POST   | `/partitions/seed`          | write | Seed orders `{ "amount": "10k" }`  |
| POST   | `/partitions/detach`        | write | Detach a partition                 |
| GET    | `/partitions`               | read  | List partitions + status           |
| GET    | `/partitions/query/:name`   | read  | Direct vs parent query comparison  |

Bulk amount values: `10k`, `100k`, `1m` (employees) · `10k`, `100k` (orders).

---

## Partition lab (UI or API)

Run these steps **in order** for the clearest demo:

1. **Setup** — create `orders` table with Jan–Jun 2025 partitions + default
2. **Seed** — insert 10K or 100K rows spread across months
3. **Detach** — e.g. `ALTER TABLE orders DETACH PARTITION orders_2025_01`
4. **Query** — compare `SELECT FROM orders_2025_01` (direct) vs `SELECT FROM orders WHERE ...` (parent)

After detach, data stays in the standalone table but disappears from parent queries for that date range.

---

## Project structure

```
pg-scaling-lab/
├── docker-compose.yml    # Full stack definition
├── init-primary.sh       # WAL replication + replicator user
├── init-replica.sh       # pg_basebackup + standby startup
├── pgbouncer-read.ini    # Read pooler round-robin config
├── index.js              # Express API
├── db.js                 # Read/write connection pools
├── partitions.js         # Partition setup, seed, detach, query
├── public/               # Console dashboard (HTML/CSS/JS)
├── sql.sql               # Manual SQL exercises
├── REVIEW.md             # Post-lesson reference guide
└── ACCOMPLISHMENTS.md    # Summary of what you built
```

---

## Useful commands

```bash
docker compose ps              # Check service status
docker compose logs -f api     # Follow API logs
docker compose down            # Stop (keeps data)
docker compose down -v         # Stop and wipe all data
```

Connect directly:

```bash
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d scalinglab   # primary
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d scalinglab   # replica 1
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d scalinglab   # write pooler
PGPASSWORD=postgres psql -h localhost -p 5436 -U postgres -d scalinglab   # read pooler
```

Check replication on primary:

```sql
SELECT application_name, state, replay_lag
FROM pg_stat_replication;
```

---

## Cleanup

```bash
docker compose down -v
```

This removes all containers, volumes, and frees ports 5432–5436 and 3000.

---

## Further reading

- [REVIEW.md](./REVIEW.md) — commands, troubleshooting, self-test quiz
- [ACCOMPLISHMENTS.md](./ACCOMPLISHMENTS.md) — lesson-by-lesson summary
- [NextWork lesson](https://learn.nextwork.org/projects/2f1f31d3-2209-4f90-9aa1-c7ae1c2261b1)

---

## License

ISC
