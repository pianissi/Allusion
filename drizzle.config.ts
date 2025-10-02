import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/backend/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'dev.db',
  },
});