import app from './app';
import { env } from './config/env';
import { prisma } from './config/database';

async function main() {
  // Verify database connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.warn('⚠️  Database connection failed — server will start without DB.');
    console.warn('   Start PostgreSQL with: docker compose up -d');
    if (error instanceof Error) {
      console.warn(`   Error: ${error.message}`);
    }
  }

  // Start server
  app.listen(env.PORT, () => {
    console.log(`
  🎬 Abhinay API Server
  ─────────────────────────────
  Environment : ${env.NODE_ENV}
  Port        : ${env.PORT}
  Frontend    : ${env.FRONTEND_URL}
  Health      : http://localhost:${env.PORT}/api/v1/health
  ─────────────────────────────
    `);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

main();
