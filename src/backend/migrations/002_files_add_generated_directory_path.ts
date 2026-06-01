/* eslint-disable prettier/prettier */
import { Kysely, sql } from 'kysely';

/**
 * Migration to add a generated virtual directory column and its index
 * to the files table, optimizing location tag aggregation.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('files')
    .addColumn('directory_path', 'text', (col) =>
      col.generatedAlwaysAs(sql`SUBSTR(absolute_path, 1, LENGTH(absolute_path) - LENGTH(name) - 1)`)
    )
    .execute();

  // create index
  await db.schema.createIndex('idx_files_directory_path').on('files').column('directory_path').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_files_directory_path').execute();
  await db.schema.alterTable('files').dropColumn('directory_path').execute();
}