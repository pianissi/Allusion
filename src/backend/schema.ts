import { relations } from 'drizzle-orm';
import { int, primaryKey, real, SQLiteColumn, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ExtraPropertyValue } from 'src/api/extraProperty';
import { IMG_EXTENSIONS_TYPE } from 'src/api/file';
import { SearchCriteria } from 'src/api/search-criteria';

// TODO: ensure uniqueness for keys
// Tags
////////////////////////////////////////////////
export const tagsTable = sqliteTable('tags', {
  id: text().primaryKey(),
  name: text().notNull(),
  dateAdded: int().notNull(),
  color: text(),
  // subTags: int().foreignKey(),
  // impliedTags: ID[],
  /** Whether any files with this tag should be hidden */
  isHidden: int({ mode: 'boolean' }),
  /** Whether a tag is marked as Visible when inherited */
  isVisibleInherited: int({ mode: 'boolean' }),
  isHeader: int({ mode: 'boolean' }),
  // aliases: string[],
  description: text(),
});

export const tagRelations = relations(tagsTable, ({ many }) => ({
  subTags: many(subTagsTable),
  impliedTags: many(impliedTagsTable),
  tagAliases: many(tagAliasesTable),
  fileTags: many(fileTagsTable),
  locations: many(locationTagsTable),
  subLocations: many(subLocationTagsTable),
}));

// One parent can have many subtags
// One subtag can only have one parent
export const subTagsTable = sqliteTable('subTags', {
  subTag: text()
    .primaryKey()
    .references(() => tagsTable.id, { onDelete: 'cascade' })
    .notNull(),
  tag: text()
    .references(() => tagsTable.id, { onDelete: 'cascade' })
    .notNull(),
});

export const subTagsRelations = relations(subTagsTable, ({ one }) => ({
  parentTag: one(tagsTable, {
    fields: [subTagsTable.tag],
    references: [tagsTable.id],
  }),
}));

// Many to Many relationship
export const impliedTagsTable = sqliteTable('impliedTags', {
  id: int().primaryKey(),
  impliedTag: text()
    .references(() => tagsTable.id, { onDelete: 'cascade' })
    .notNull(),
  tag: text()
    .references(() => tagsTable.id, { onDelete: 'cascade' })
    .notNull(),
});

export const impliedTagsRelations = relations(impliedTagsTable, ({ one }) => ({
  parentTag: one(tagsTable, {
    fields: [impliedTagsTable.tag],
    references: [tagsTable.id],
  }),
}));

export const tagAliasesTable = sqliteTable('tagAliases', {
  id: int().primaryKey(),
  alias: text(),
  tag: text()
    .references(() => tagsTable.id, { onDelete: 'cascade' })
    .notNull(),
});

export const tagAliasesRelations = relations(tagAliasesTable, ({ one }) => ({
  parentTag: one(tagsTable, {
    fields: [tagAliasesTable.tag],
    references: [tagsTable.id],
  }),
}));

/////////////////////////////////////////////

// Files
///////////////////////////////////////////////

export const filesTable = sqliteTable('files', {
  id: text().primaryKey(),
  ino: text().notNull(),
  locationId: text().references(() => locationsTable.id, { onDelete: 'cascade' }),
  relativePath: text().notNull(),
  absolutePath: text().notNull().unique(),

  dateAdded: int().notNull(),
  dateModified: int().notNull(),
  origDateModified: int().notNull(),
  dateLastIndexed: int().notNull(),
  dateCreated: int().notNull(),

  name: text().notNull(),
  extension: text().$type<IMG_EXTENSIONS_TYPE>().notNull(),
  size: real().notNull(),
  width: int().notNull(),
  height: int().notNull(),
});

export const filesRelations = relations(filesTable, ({ many, one }) => ({
  fileTags: many(fileTagsTable),
  fileExtraProperties: many(fileExtraPropertiesTable),
  locations: one(locationsTable, {
    fields: [filesTable.locationId],
    references: [locationsTable.id],
  }),
}));

// many tags can have many files
export const fileTagsTable = sqliteTable(
  'fileTags',
  {
    tag: text().references(() => tagsTable.id, { onDelete: 'cascade' }),
    file: text().references(() => filesTable.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.tag, t.file] })],
);

export const fileTagsRelations = relations(fileTagsTable, ({ one }) => ({
  file: one(filesTable, {
    fields: [fileTagsTable.file],
    references: [filesTable.id],
  }),
  tag: one(tagsTable, {
    fields: [fileTagsTable.tag],
    references: [tagsTable.id],
  }),
}));

export const fileExtraPropertiesTable = sqliteTable(
  'fileExtraProperties',
  {
    value: text('', { mode: 'json' }).$type<ExtraPropertyValue>(),
    extraProperties: text()
      .references(() => extraPropertiesTable.id, { onDelete: 'cascade' })
      .notNull(),
    file: text().references(() => filesTable.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.extraProperties, t.file] })],
);

export const fileExtraPropertiesRelations = relations(fileExtraPropertiesTable, ({ one }) => ({
  file: one(filesTable, {
    fields: [fileExtraPropertiesTable.file],
    references: [filesTable.id],
  }),
  extraProperties: one(extraPropertiesTable, {
    fields: [fileExtraPropertiesTable.extraProperties],
    references: [extraPropertiesTable.id],
  }),
}));
//////////////////////////////////////////////

// Locations
//////////////////////////////////////////////
export const locationsTable = sqliteTable('locations', {
  id: text().primaryKey(),
  path: text().notNull(),
  dateAdded: int().notNull(),

  index: int().notNull(),
  isWatchingFiles: int({ mode: 'boolean' }),
});

export const locationsRelations = relations(locationsTable, ({ many }) => ({
  subLocations: many(subLocationsTable),
  locationsTag: many(locationTagsTable),
}));

export const locationTagsTable = sqliteTable(
  'locationTags',
  {
    tag: text().references(() => tagsTable.id, { onDelete: 'cascade' }),
    location: text().references(() => locationsTable.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.tag, t.location] })],
);

export const locationsTagRelations = relations(locationTagsTable, ({ one }) => ({
  locations: one(locationsTable, {
    fields: [locationTagsTable.location],
    references: [locationsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [locationTagsTable.tag],
    references: [tagsTable.id],
  }),
}));

export const subLocationsTable = sqliteTable('subLocations', {
  // id is equal to sublocation
  id: text().primaryKey(),
  name: text(),
  rootLocation: text().references(() => locationsTable.id, { onDelete: 'cascade' }),
  isExcluded: int({ mode: 'boolean' }),
  parentLocation: text().references((): SQLiteColumn => subLocationsTable.id, {
    onDelete: 'cascade',
  }),
});

export const subLocationTagsTable = sqliteTable(
  'subLocationTags',
  {
    tag: text().references(() => tagsTable.id, { onDelete: 'cascade' }),
    subLocation: text().references(() => subLocationsTable.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.tag, t.subLocation] })],
);

export const subLocationsTagRelations = relations(subLocationTagsTable, ({ one }) => ({
  subLocations: one(subLocationsTable, {
    fields: [subLocationTagsTable.subLocation],
    references: [subLocationsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [subLocationTagsTable.tag],
    references: [tagsTable.id],
  }),
}));

export const subLocationsRelations = relations(subLocationsTable, ({ one, many }) => ({
  rootLocation: one(locationsTable, {
    fields: [subLocationsTable.parentLocation],
    references: [locationsTable.id],
  }),
  childLocations: many(subLocationsTable),
  parentLocation: one(subLocationsTable, {
    fields: [subLocationsTable.parentLocation],
    references: [subLocationsTable.id],
  }),
  subLocationsTag: many(subLocationTagsTable),
}));
//////////////////////////////////////////////

// Search Store
//////////////////////////////////////////////
export const fileSearchTable = sqliteTable('fileSearch', {
  id: text().primaryKey(),
  name: text().notNull(),
  dateAdded: int().notNull(),

  matchAny: int({ mode: 'boolean' }),
  index: int().notNull(),
});

export const fileSearchRelations = relations(fileSearchTable, ({ many }) => ({
  searchCriterias: many(fileSearchCriteriasTable),
}));

export const fileSearchCriteriasTable = sqliteTable('fileSearchCriterias', {
  id: int().primaryKey(),
  criteria: text('', { mode: 'json' }).$type<SearchCriteria>(),
  fileSearch: text().references(() => fileSearchTable.id, { onDelete: 'cascade' }),
});

export const fileSearchCriterasRelations = relations(fileSearchCriteriasTable, ({ one }) => ({
  fileSearch: one(fileSearchTable, {
    fields: [fileSearchCriteriasTable.fileSearch],
    references: [fileSearchTable.id],
  }),
}));
//////////////////////////////////////////////

// Extra Properties
//////////////////////////////////////////////

export const extraPropertiesRelations = relations(fileTagsTable, ({ many }) => ({
  fileExtraProperties: many(fileExtraPropertiesTable),
}));

export const extraPropertiesTable = sqliteTable('extraProperties', {
  id: text().primaryKey(),
  type: text().$type<'number' | 'string'>(),
  name: text(),
  dateAdded: int().notNull(),
});
//////////////////////////////////////////////
