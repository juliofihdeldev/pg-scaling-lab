-- Create a test table on the primary

-- -- Insert sample employees
-- INSERT INTO employees (name, department, salary) VALUES
--     ('Julio JEAN FILS', 'Engineering', 95000.00),
--     ('Bob Smith', 'Marketing', 72000.00),
--     ('Carol Davis', 'Engineering', 98000.00);

-- Connect manually from your terminal (these are shell commands, not SQL):
--   PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d scalinglab   # primary
--   PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d scalinglab   # replica 1



-- Generate 10,000 rows to create write pressure
-- INSERT INTO employees (name, department, salary)
-- SELECT
--     'Employee_' || i,
--     CASE (i % 4)
--         WHEN 0 THEN 'Engineering'
--         WHEN 1 THEN 'Marketing'
--         WHEN 2 THEN 'Sales'
--         WHEN 3 THEN 'Support'
--     END,
--     40000 + (random() * 60000)::NUMERIC(10, 2)
-- FROM generate_series(1, 10000) AS i;