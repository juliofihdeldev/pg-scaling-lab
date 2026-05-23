-- Create a test table on the primary

-- -- Insert sample employees
-- INSERT INTO employees (name, department, salary) VALUES
--     ('Alice Chen', 'Engineering', 95000.00),
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



-- Create a partitioned table using range partitioning on order_date
-- CREATE TABLE orders (
--     order_id SERIAL,
--     customer_id INTEGER NOT NULL,
--     order_date DATE NOT NULL,
--     amount DECIMAL(10,2) NOT NULL,
--     status VARCHAR(20) DEFAULT 'pending',
--     PRIMARY KEY (order_id, order_date)
-- ) PARTITION BY RANGE (order_date);

-- PostgreSQL requires the partition key to be part of any primary key
-- or unique constraint on a partitioned table. This ensures uniqueness 
-- can be enforced within each partition independently.

-- Create monthly partitions for the first half of 2025
CREATE TABLE orders_2025_01 PARTITION OF orders
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE orders_2025_02 PARTITION OF orders
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE orders_2025_03 PARTITION OF orders
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE orders_2025_04 PARTITION OF orders
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE orders_2025_05 PARTITION OF orders
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE orders_2025_06 PARTITION OF orders
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- Catch any rows that don't fit existing partitions
CREATE TABLE orders_default PARTITION OF orders DEFAULT;



-- Insert 100,000 orders spread across January to June 2025
INSERT INTO orders (customer_id, order_date, amount, status)
SELECT
    (random() * 10000)::INTEGER + 1,
    '2025-01-01'::DATE + (random() * 181)::INTEGER,
    (random() * 500 + 5)::DECIMAL(10,2),
    CASE (random() * 3)::INTEGER
        WHEN 0 THEN 'pending'
        WHEN 1 THEN 'shipped'
        WHEN 2 THEN 'delivered'
        ELSE 'pending'
    END
FROM generate_series(1, 100000);




-- Check how many rows landed in each partition
SELECT
    tableoid::regclass AS partition_name,
    COUNT(*) AS row_count
FROM orders
GROUP BY tableoid
ORDER BY partition_name;