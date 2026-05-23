#!/bin/bash
set -e

# Wait for primary to be ready
until PGPASSWORD=replicator_pass pg_isready -h pg-primary -U replicator -d replication; do
  echo "Waiting for primary to be ready..."
  sleep 2
done

# Only initialize if data directory is empty
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Cloning primary with pg_basebackup..."
  rm -rf "$PGDATA"/*

  PGPASSWORD=replicator_pass pg_basebackup \
    -h pg-primary \
    -U replicator \
    -D "$PGDATA" \
    -R \
    -X stream \
    -C \
    -S "replica_slot_$(hostname | tr '-' '_')" \
    -c fast

  echo "Backup complete. Starting replica..."
fi

# Start PostgreSQL in the foreground
exec postgres
