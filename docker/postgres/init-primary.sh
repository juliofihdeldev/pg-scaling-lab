#!/bin/bash
set -e

# Configure replication settings
cat >> "$PGDATA/postgresql.conf" <<EOF

# Replication settings
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on
listen_addresses = '*'
EOF

# Create replication user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator_pass';
EOSQL

# Allow replication connections from any host in the Docker network
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
echo "host all all all scram-sha-256" >> "$PGDATA/pg_hba.conf"
