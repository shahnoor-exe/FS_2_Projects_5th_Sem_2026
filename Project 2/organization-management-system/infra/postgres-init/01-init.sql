-- ═══════════════════════════════════════════════════════════════════════════════
-- OrgSphere PostgreSQL Container Initialization Script
-- NOTE: This script is executed by the official PostgreSQL container entrypoint
-- ONLY ONCE upon the initial creation of an empty database data volume.
-- For subsequent schema modifications, always use Prisma Migrations:
-- npx prisma migrate dev
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create test database if it does not already exist
SELECT 'CREATE DATABASE orgsphere_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'orgsphere_test')\gexec

-- Connect to primary dev database and enable uuid extension
\connect orgsphere_dev;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Connect to test database and enable uuid extension
\connect orgsphere_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
