import { defineConfig } from 'prisma/config';
import 'dotenv/config';

let dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/gallery_express?schema=public';

// If running outside Docker container, replace internal container hostname 'postgres' with 'localhost'
if (process.env.DOCKER_CONTAINER !== 'true' && dbUrl.includes('@postgres:')) {
  dbUrl = dbUrl.replace('@postgres:', '@localhost:');
}

export default defineConfig({
  datasource: {
    url: dbUrl,
  },
});
