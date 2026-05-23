-- Create a test table on the primary

-- -- Insert sample employees
INSERT INTO employees (name, department, salary) VALUES
    ('Julio JEAN FILS', 'Engineering', 125000.00);

-- Connect manually from your terminal (these are shell commands, not SQL):
--   PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d scalinglab   # primary
--   PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d scalinglab   # replica 1
