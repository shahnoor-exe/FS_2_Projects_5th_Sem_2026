import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../src/config/prisma.js';

async function main() {
  const rawUrl = process.env.DATABASE_URL || '';
  const parsed = new URL(rawUrl);

  const clientConfig = {
    targetHost: parsed.hostname,
    targetPort: parsed.port,
    targetDatabase: parsed.pathname.replace(/^\//, ''),
    targetUser: parsed.username,
  };

  const queryResult = await prisma.$queryRaw<Array<{
    db_name: string;
    internal_port: number;
    server_addr: string | null;
    client_addr: string | null;
  }>>`
    SELECT
      current_database() AS db_name,
      inet_server_port() AS internal_port,
      inet_server_addr()::text AS server_addr,
      inet_client_addr()::text AS client_addr
  `;

  console.log('CLIENT_CONFIG:', JSON.stringify(clientConfig, null, 2));
  console.log('QUERY_RESULT:', JSON.stringify(queryResult, null, 2));
}

main()
  .catch((err) => {
    console.error('Failed to verify target:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
