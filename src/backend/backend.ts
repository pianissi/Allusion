import { DataStorage } from 'src/api/data-storage';
import {
  impliedTagsTable,
  subTagsTable,
  tagAliasesTable,
  tagsTable,
  filesTable,
  fileTagsTable,
  fileExtraPropertiesTable,
  locationsTable,
  subLocationsTable,
  locationTagsTable,
  subLocationTagsTable,
} from './schema';
import { ROOT_TAG_ID, TagDTO } from 'src/api/tag';
import { and, eq, getTableColumns, inArray, like, notInArray, or, SQL, sql } from 'drizzle-orm';

import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import 'dotenv/config';
import { IndexableType } from 'dexie';
import { ConditionDTO, OrderBy, OrderDirection } from 'src/api/data-storage-search';
import { ExtraPropertyDTO, ExtraProperties } from 'src/api/extraProperty';
import { FileDTO } from 'src/api/file';
import { FileSearchDTO } from 'src/api/file-search';
import { generateId, ID } from 'src/api/id';
import { LocationDTO, SubLocationDTO } from 'src/api/location';
import * as schema from './schema';
import Database from 'better-sqlite3';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';

type TagsDB = typeof tagsTable.$inferInsert;
type SubTagsDB = typeof subTagsTable.$inferInsert;
type ImpliedTagsDB = typeof impliedTagsTable.$inferInsert;
type TagAliasesDB = typeof tagAliasesTable.$inferInsert;

type FilesDB = typeof filesTable.$inferInsert;
type FileTagsDB = typeof fileTagsTable.$inferInsert;

type FileExtraPropertiesDB = typeof fileTagsTable.$inferInsert;

type LocationsDB = typeof locationsTable.$inferInsert;
type SubLocationsDB = typeof subLocationsTable.$inferInsert;
type LocationTagsDB = typeof locationTagsTable.$inferInsert;
type SubLocationTagsDB = typeof subLocationTagsTable.$inferInsert;

type FileData = typeof filesTable.$inferSelect & {
  fileTags: (typeof fileTagsTable.$inferSelect)[];
  fileExtraProperties: (typeof fileExtraPropertiesTable.$inferSelect)[];
};

type LocationsData = typeof subLocationsTable.$inferSelect & {
  subLocations: (typeof subLocationsTable.$inferSelect)[];
  locationsTag: (typeof locationTagsTable.$inferSelect)[];
};

type SubLocationsData = typeof subLocationsTable.$inferSelect & {
  parentLocation: (typeof subLocationsTable.$inferSelect)[];
  subLocationsTag: (typeof schema.subLocationTagsTable.$inferSelect)[];
};

// https://github.com/drizzle-team/drizzle-orm/issues/1728
const conflictUpdateAllExcept = <T extends SQLiteTable, E extends (keyof T['$inferInsert'])[]>(
  table: T,
  except: E,
) => {
  const columns = getTableColumns(table);
  const updateColumns = Object.entries(columns).filter(
    ([col]) => !except.includes(col as keyof typeof table.$inferInsert),
  );

  return updateColumns.reduce(
    (acc, [colName, table]) => ({
      ...acc,
      [colName]: sql.raw(`excluded.${table.name}`),
    }),
    {},
  ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>;
};

export default class Backend implements DataStorage {
  #db: BetterSQLite3Database<typeof schema>;
  #notifyChange: () => void;

  constructor(notifyChange: () => void) {
    console.info('Drizzle(Better-SQLite3): Initializing database ...');
    // Initialize database tables
    const sqlite = new Database(process.env.DB_FILE_NAME!);
    // TODO remove logger
    this.#db = drizzle({ client: sqlite, schema: schema });
    // TODO fix whatever this type declaration is
    // TODO add db injection???
    this.#notifyChange = notifyChange;
  }

  static async init(notifyChange: () => void): Promise<Backend> {
    const backend = new Backend(notifyChange);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    // return USE_TIMING_PROXY ? createTimingProxy(backend) : backend;
    if ((await backend.fetchTags()).length === 0) {
      await backend.createTag({
        id: ROOT_TAG_ID,
        name: 'Root',
        dateAdded: new Date(),
        subTags: [],
        impliedTags: [],
        color: '',
        isHidden: false,
        isVisibleInherited: false,
        aliases: [],
        description: '',
        isHeader: false,
      });
    }
    return backend;
  }

  async fetchTags(): Promise<TagDTO[]> {
    console.info('Better-SQLite3: Fetching tags...');

    const tagsData = await this.#db.query.tagsTable.findMany({
      with: {
        subTags: true,
        impliedTags: true,
        tagAliases: true,
      },
    });
    const tagsDTO: TagDTO[] = [];
    for (const tagData of tagsData) {
      tagsDTO.push({
        id: tagData.id,
        name: tagData.name,
        dateAdded: new Date(tagData.dateAdded),
        color: tagData.color || '',
        subTags: tagData.subTags.map((subTag) => subTag.subTag),
        impliedTags: tagData.impliedTags.map((impliedTag) => impliedTag.impliedTag),
        isHidden: tagData.isHidden || false,
        isVisibleInherited: tagData.isVisibleInherited || false,
        isHeader: tagData.isHeader || false,
        aliases: tagData.tagAliases.map((alias) => alias.alias || ''),
        description: tagData.description || '',
      });
    }
    return tagsDTO;
  }

  fileDBConverter(file: FileDTO): FilesDB {
    return {
      id: file.id,
      ino: file.ino,
      locationId: file.locationId,
      relativePath: file.relativePath,
      absolutePath: file.absolutePath,
      dateAdded: file.dateAdded.getTime(),
      dateModified: file.dateModified.getTime(),
      origDateModified: file.OrigDateModified.getTime(),
      dateLastIndexed: file.dateLastIndexed.getTime(),
      dateCreated: file.dateCreated.getTime(),
      name: file.name,
      extension: file.extension,
      size: file.size,
      width: file.width,
      height: file.height,
    };
  }

  filesDTOConverter(filesData: FileData[]): FileDTO[] {
    const filesDTO: FileDTO[] = [];
    for (const fileData of filesData) {
      filesDTO.push({
        id: fileData.id,
        ino: fileData.ino,
        locationId: fileData.locationId || '',
        relativePath: fileData.relativePath,
        absolutePath: fileData.absolutePath,

        dateAdded: new Date(fileData.dateAdded),
        dateModified: new Date(fileData.dateModified),
        // TODO maybe fix naming convention here
        OrigDateModified: new Date(fileData.origDateModified),
        dateLastIndexed: new Date(fileData.dateLastIndexed),
        dateCreated: new Date(fileData.dateCreated),

        name: fileData.name,
        extension: fileData.extension,
        size: fileData.size,
        width: fileData.width,
        height: fileData.height,

        tags: fileData.fileTags.map((fileTag) => fileTag.tag || ''),
        extraProperties: fileData.fileExtraProperties.reduce(
          (acc: ExtraProperties, fileExtraProperties) => {
            acc[fileExtraProperties.extraProperties] = fileExtraProperties.value || '';
            return acc;
          },
          {},
        ),
        extraPropertyIDs: fileData.fileExtraProperties.map((fileExtraProperties) => {
          return fileExtraProperties.extraProperties;
        }),
      });
    }
    return filesDTO;
  }

  async fetchFiles(
    order: OrderBy<FileDTO>,
    fileOrder: OrderDirection,
    useNaturalOrdering: boolean,
    extraPropertyID?: ID,
  ): Promise<FileDTO[]> {
    // return new Promise(() => {});
    console.info('Better-SQLite3: Fetching files...');
    const filesData = await this.#db.query.filesTable.findMany({
      with: {
        fileExtraProperties: true,
        fileTags: true,
      },
    });
    //
    // TODO use ordering
    const result = this.filesDTOConverter(filesData);
    console.info('Better-SQLite3: Fetched files', result);
    return result;
    // if (order === 'random') {
    //   return shuffleArray(await this.#files.toArray());
    // }
    // if (order === 'extraProperty') {
    //   order = 'dateAdded';
    //   if (extraPropertyID) {
    //     const extraProperty = await this.#extraProperties.get(extraPropertyID);
    //     if (extraProperty) {
    //       return await orderByExtraProperty(
    //         this.#files.orderBy(order),
    //         fileOrder,
    //         extraProperty,
    //         useNaturalOrdering,
    //       );
    //     } else {
    //       console.error(`IndexedDB: Custom field with ID "${extraPropertyID}" not found.`);
    //     }
    //   }
    // }

    // let items;
    // if (useNaturalOrdering && isFileDTOPropString(order)) {
    //   const key = order as StringProperties<FileDTO>;
    //   items = (await this.#files.toArray()).sort((a: FileDTO, b: FileDTO) =>
    //     a[key].localeCompare(b[key], undefined, { numeric: true, sensitivity: 'base' }),
    //   );
    // } else {
    //   const collection = this.#files.orderBy(order);
    //   items = await collection.toArray();
    // }

    // if (fileOrder === OrderDirection.Desc) {
    //   return items.reverse();
    // } else {
    //   return items;
  }

  async fetchFilesByID(ids: ID[]): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Fetching files by ID...');
    const filesData = await this.#db.query.filesTable.findMany({
      where: inArray(filesTable.id, ids),
      with: {
        fileExtraProperties: true,
        fileTags: true,
      },
    });
    //
    // TODO use ordering

    return this.filesDTOConverter(filesData);
  }

  async fetchFilesByKey(key: keyof FileDTO, value: IndexableType): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Fetching files by key/value...', { key, value });

    const dbKey = key as keyof FilesDB;

    // TODO: do actual validation on data here, but it's really only used in two places for ino and path so not a priority

    const filesData = await this.#db.query.filesTable.findMany({
      where: eq(filesTable[dbKey], value as string | number),
      with: {
        fileExtraProperties: true,
        fileTags: true,
      },
    });
    return this.filesDTOConverter(filesData);
    // return this.#files.where(key).equals(value).toArray();
  }

  async fetchLocations(): Promise<LocationDTO[]> {
    console.info('Better-SQLite3: Fetching locations...');
    const locationsData = await this.#db.query.locationsTable.findMany({
      with: {
        subLocations: true,
        locationsTag: true,
      },
    });
    const subLocationsData = await this.#db.query.subLocationsTable.findMany({
      with: {
        subLocationsTag: true,
      },
    });
    const locationsDTO: LocationDTO[] = [];

    const locationTable = new Map<string, LocationDTO>();
    const subLocationTable = new Map<string, SubLocationDTO>();

    subLocationsData.forEach((data) => {
      subLocationTable.set(data.id, {
        id: data.id,
        name: data.name || '',
        isExcluded: data.isExcluded || false,
        subLocations: [], // we will insert into this
        tags: data.subLocationsTag.map((tag) => tag.tag || ''),
      });
    });

    locationsData.forEach((data) => {
      const dto: LocationDTO = {
        id: data.id,
        path: data.path || '',
        dateAdded: new Date(data.dateAdded),
        subLocations: data.subLocations.reduce((acc: SubLocationDTO[], subLocations) => {
          const dto = subLocationTable.get(subLocations.id);
          if (dto) {
            acc.push(dto);
          }
          return acc;
        }, []),
        tags: data.locationsTag.map((tag) => tag.tag || ''),
        index: data.index,
        isWatchingFiles: data.isWatchingFiles || true,
      };
      locationTable.set(data.id, dto);
      locationsDTO.push(dto);
    });

    subLocationsData.forEach((data) => {
      if (data.parentLocation) {
        const child = subLocationTable.get(data.id);
        if (!child) {
          return;
        }

        const parent = subLocationTable.get(data.parentLocation);

        if (!parent) {
          return;
        }
        parent.subLocations.push(child);
      }
    });
    return locationsDTO;
  }

  async fetchSearches(): Promise<FileSearchDTO[]> {
    return [];
    // console.info('IndexedDB: Fetching searches...');
    // return this.#searches.toArray();
  }

  async fetchExtraProperties(): Promise<ExtraPropertyDTO[]> {
    return [];
    //
    // console.info('IndexedDB: Fetching extra properties...');
    // return this.#extraProperties.orderBy('name').toArray();
  }

  async searchFiles(
    criteria: ConditionDTO<FileDTO> | [ConditionDTO<FileDTO>, ...ConditionDTO<FileDTO>[]],
    order: OrderBy<FileDTO>,
    fileOrder: OrderDirection,
    useNaturalOrdering: boolean,
    extraPropertyID?: ID,
    matchAny?: boolean,
  ): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Searching files...', { criteria, matchAny });

    const filters = [];
    const tagFilters = [];

    let criterias = [];
    if (Array.isArray(criteria)) {
      criterias = criteria;
    } else {
      criterias.push(criteria);
    }
    for (const crit of criterias) {
      if (crit.operator === 'startsWith') {
        let value = crit.value;
        // Because % is a wildcard, we have to escape the character
        if (typeof crit.value === 'string') {
          // Double slash to escape itself
          value = crit.value.replaceAll('%', '\\%') + '%';
          console.log(value);

          filters.push(like(filesTable[crit.key], value));
        }
      }
      if (crit.key === 'tags') {
        const tagList = [];
        if (typeof crit.value === 'string') {
          tagList.push(crit.value);
        } else if (Array.isArray(crit.value)) {
          tagList.push(...crit.value);
        }

        if (crit.operator === 'contains') {
          filters.push(
            inArray(
              filesTable.id,
              this.#db
                .select({ id: fileTagsTable.file })
                .from(fileTagsTable)
                .where(inArray(fileTagsTable.tag, crit.value)),
            ),
          );
        } else if (crit.operator === 'notContains') {
          filters.push(
            notInArray(
              filesTable.id,
              this.#db
                .select({ id: fileTagsTable.file })
                .from(fileTagsTable)
                .where(inArray(fileTagsTable.tag, crit.value)),
            ),
          );
        }
      }
    }
    const filesData = await this.#db.query.filesTable.findMany({
      where: and(...filters),
      with: {
        fileExtraProperties: true,
        fileTags: true,
      },
    });
    //
    // TODO use ordering
    const result = this.filesDTOConverter(filesData);
    console.info('Better-SQLite3: Fetched files', result);
    return result;
    // console.info('IndexedDB: Searching files...', { criteria, matchAny });
    // const criterias = Array.isArray(criteria) ? criteria : ([criteria] as [ConditionDTO<FileDTO>]);
    // const collection = await filter(this.#files, criterias, matchAny ? 'or' : 'and');

    // if (order === 'random') {
    //   return shuffleArray(await collection.toArray());
    // }
    // if (order === 'extraProperty') {
    //   order = 'dateAdded';
    //   if (extraPropertyID) {
    //     const extraProperty = await this.#extraProperties.get(extraPropertyID);
    //     if (extraProperty) {
    //       return await orderByExtraProperty(
    //         collection,
    //         fileOrder,
    //         extraProperty,
    //         useNaturalOrdering,
    //       );
    //     } else {
    //       console.error(`IndexedDB: Custom field with ID "${extraPropertyID}" not found.`);
    //     }
    //   }
    // }
    // // table.reverse() can be an order of magnitude slower than a javascript .reverse() call
    // // (tested at ~5000 items, 500ms instead of 100ms)
    // // easy to verify here https://jsfiddle.net/dfahlander/xf2zrL4p
    // let items;
    // if (useNaturalOrdering && isFileDTOPropString(order)) {
    //   const key = order as StringProperties<FileDTO>;
    //   items = (await collection.toArray()).sort((a: FileDTO, b: FileDTO) =>
    //     a[key].localeCompare(b[key], undefined, { numeric: true, sensitivity: 'base' }),
    //   );
    // } else {
    //   items = await collection.sortBy(order);
    // }

    // if (fileOrder === OrderDirection.Desc) {
    //   return items.reverse();
    // } else {
    //   return items;
    // }
  }

  async createTag(tag: TagDTO): Promise<void> {
    console.info('IndexedDB: Creating tag...', tag);
    const tagsData: TagsDB = {
      id: tag.id,
      name: tag.name,
      dateAdded: tag.dateAdded.getTime(),
      color: tag.color,
      isHidden: tag.isHidden,
      isVisibleInherited: tag.isVisibleInherited,
      isHeader: tag.isHeader,
      description: tag.description,
    };
    const subTagsData: SubTagsDB[] = [];
    for (const subTag of tag.subTags) {
      subTagsData.push({ subTag: subTag, tag: tag.id });
    }
    const impliedTagsData: ImpliedTagsDB[] = [];
    for (const impliedTag of tag.impliedTags) {
      impliedTagsData.push({ impliedTag: impliedTag, tag: tag.id });
    }
    const tagAliasesData: TagAliasesDB[] = [];
    for (const alias of tag.aliases) {
      tagAliasesData.push({ alias: alias, tag: tag.id });
    }
    await this.#db.insert(tagsTable).values(tagsData);
    if (subTagsData.length > 0) {
      await this.#db.insert(subTagsTable).values(subTagsData);
    }
    if (impliedTagsData.length > 0) {
      await this.#db.insert(impliedTagsTable).values(impliedTagsData);
    }
    if (tagAliasesData.length > 0) {
      await this.#db.insert(tagAliasesTable).values(tagAliasesData);
    }
    this.#notifyChange();
  }

  async createLocation(location: LocationDTO): Promise<void> {
    // TODO: remember to create UUID for sublocations
    console.info('Better-SQLite3: Creating location...', location);
    const locationData: LocationsDB = {
      id: location.id,
      path: location.path,
      dateAdded: location.dateAdded.getTime(),
      index: location.index,
      isWatchingFiles: location.isWatchingFiles,
    };
    const locationTagsData: LocationTagsDB[] = [];
    for (const tag of location.tags) {
      locationTagsData.push({ tag: tag, location: location.id });
    }

    await this.#db.insert(locationsTable).values(locationData);
    if (locationTagsData.length > 0) {
      await this.#db.insert(locationTagsTable).values(locationTagsData);
    }
    for (const subLocation of location.subLocations) {
      this.createSubLocation(subLocation, location.id);
    }
    this.#notifyChange();
  }

  // This is solely a helper
  async createSubLocation(
    subLocation: SubLocationDTO,
    rootLocation: string | undefined,
    parentLocation?: string | undefined,
  ): Promise<void> {
    console.info('Better-SQLite3: Creating sub location...', subLocation);
    const subLocationData: SubLocationsDB = {
      id: subLocation.id,
      name: subLocation.name,
      rootLocation: rootLocation,
      parentLocation: parentLocation,
      isExcluded: subLocation.isExcluded,
    };
    const locationTagsData: SubLocationTagsDB[] = [];
    for (const tag of subLocation.tags) {
      locationTagsData.push({ tag: tag, subLocation: subLocationData.id });
    }
    // TODO probably better if it was just one query
    await this.#db.insert(subLocationsTable).values(subLocationData);
    if (locationTagsData.length > 0) {
      await this.#db.insert(subLocationTagsTable).values(locationTagsData);
    }
    for (const child of subLocation.subLocations) {
      this.createSubLocation(child, rootLocation, subLocationData.id);
    }
  }

  async createSearch(search: FileSearchDTO): Promise<void> {
    // console.info('IndexedDB: Creating search...', search);
    // await this.#searches.add(search);
    // this.#notifyChange();
  }

  async createExtraProperty(extraProperty: ExtraPropertyDTO): Promise<void> {
    // console.info('IndexedDB: Creating extra property...', extraProperty);
    // await this.#extraProperties.add(extraProperty);
    // this.#notifyChange();
  }

  async saveTag(tag: TagDTO): Promise<void> {
    // we have to update old entries of subTags
    const tagsData = {
      name: tag.name,
      dateAdded: tag.dateAdded.getTime(),
      color: tag.color,
      isHidden: tag.isHidden,
      isVisibleInherited: tag.isVisibleInherited,
      isHeader: tag.isHeader,
      description: tag.description,
    };
    const subTagsData: SubTagsDB[] = [];
    for (const subTag of tag.subTags) {
      subTagsData.push({ subTag: subTag, tag: tag.id });
    }
    const impliedTagsData: ImpliedTagsDB[] = [];
    for (const impliedTag of tag.impliedTags) {
      impliedTagsData.push({ impliedTag: impliedTag, tag: tag.id });
    }
    const tagAliasesData: TagAliasesDB[] = [];
    for (const alias of tag.aliases) {
      tagAliasesData.push({ alias: alias, tag: tag.id });
    }
    await this.#db.update(tagsTable).set(tagsData).where(eq(tagsTable.id, tag.id));
    if (subTagsData.length > 0) {
      await this.#db
        .insert(subTagsTable)
        .values(subTagsData)
        .onConflictDoUpdate({
          target: subTagsTable.subTag,
          set: {
            tag: sql`excluded.tag`, // Update the name to the new value
          },
        });
    }
    await this.#db.delete(impliedTagsTable).where(eq(impliedTagsTable.tag, tag.id));
    if (impliedTagsData.length > 0) {
      await this.#db.insert(impliedTagsTable).values(impliedTagsData);
    }
    await this.#db.delete(tagAliasesTable).where(eq(tagAliasesTable.tag, tag.id));
    if (tagAliasesData.length > 0) {
      await this.#db.insert(tagAliasesTable).values(tagAliasesData);
    }

    console.info('IndexedDB: Saving tag...', tag);
    this.#notifyChange();
  }

  async saveFiles(files: FileDTO[]): Promise<void> {
    console.info('Better-SQLite3: Saving files...', files);
    const filesData: FilesDB[] = [];
    const fileIds = [];
    for (const file of files) {
      filesData.push(this.fileDBConverter(file));
      fileIds.push(file.id);
    }
    const fileTagsData: FileTagsDB[] = [];
    for (const file of files) {
      for (const tag of file.tags) {
        fileTagsData.push({ tag: tag, file: file.id });
      }
    }

    if (filesData.length > 0) {
      await this.#db
        .insert(filesTable)
        .values(filesData)
        .onConflictDoUpdate({
          target: filesTable.id,
          set: conflictUpdateAllExcept(filesTable, []),
        });
    }
    await this.#db.delete(fileTagsTable).where(inArray(fileTagsTable.file, fileIds));
    if (fileTagsData.length > 0) {
      await this.#db.insert(fileTagsTable).values(fileTagsData);
    }

    // TODO, handle extra properties
    this.#notifyChange();
  }

  async saveLocation(location: LocationDTO): Promise<void> {
    console.info('Better-SQLite3: Saving location...', location);
    const locationData: LocationsDB = {
      id: location.id,
      path: location.path,
      dateAdded: location.dateAdded.getTime(),
      index: location.index,
      isWatchingFiles: location.isWatchingFiles,
    };
    const locationTagsData: LocationTagsDB[] = [];
    for (const tag of location.tags) {
      locationTagsData.push({ tag: tag, location: location.id });
    }

    await this.#db
      .update(locationsTable)
      .set(locationData)
      .where(eq(locationsTable.id, location.id));
    await this.#db.delete(locationTagsTable).where(eq(locationTagsTable.location, location.id));
    if (locationTagsData.length > 0) {
      await this.#db.insert(locationTagsTable).values(locationTagsData);
    }
    for (const subLocation of location.subLocations) {
      this.saveSubLocation(subLocation);
    }
    this.#notifyChange();
  }

  // This is solely a helper
  async saveSubLocation(subLocation: SubLocationDTO): Promise<void> {
    console.info('Better-SQLite3: Creating sub location...', subLocation);
    const subLocationData = {
      id: subLocation.id,
      name: subLocation.name,
      isExcluded: subLocation.isExcluded,
    };
    const locationTagsData: SubLocationTagsDB[] = [];
    for (const tag of subLocation.tags) {
      locationTagsData.push({ tag: tag, subLocation: subLocationData.id });
    }
    // TODO probably better if it was just one query
    await this.#db.update(subLocationsTable).set(subLocationData);
    await this.#db
      .delete(subLocationTagsTable)
      .where(eq(subLocationTagsTable.subLocation, subLocation.id));
    if (locationTagsData.length > 0) {
      await this.#db.insert(subLocationTagsTable).values(locationTagsData);
    }
    for (const child of subLocation.subLocations) {
      this.saveSubLocation(child);
    }
  }

  async saveSearch(search: FileSearchDTO): Promise<void> {
    // console.info('IndexedDB: Saving search...', search);
    // await this.#searches.put(search);
    // this.#notifyChange();
  }

  async saveExtraProperty(extraProperty: ExtraPropertyDTO): Promise<void> {
    // console.info('IndexedDB: Saving extra property...', extraProperty);
    // await this.#extraProperties.put(extraProperty);
    // this.#notifyChange();
  }

  async removeTags(tags: ID[]): Promise<void> {
    await this.#db.delete(tagsTable).where(inArray(tagsTable.id, tags));
    await this.#db.delete(subTagsTable).where(inArray(subTagsTable.tag, tags));
    await this.#db.delete(impliedTagsTable).where(inArray(impliedTagsTable.tag, tags));
    await this.#db.delete(tagAliasesTable).where(inArray(tagAliasesTable.tag, tags));
    console.info('IndexedDB: Removing tags...', tags);
    this.#notifyChange();
  }

  async mergeTags(tagToBeRemoved: ID, tagToMergeWith: ID): Promise<void> {
    // console.info('IndexedDB: Merging tags...', tagToBeRemoved, tagToMergeWith);
    // await this.#db.transaction('rw', this.#files, this.#tags, () => {
    //   // Replace tag on all files with the tag to be removed
    //   this.#files
    //     .where('tags')
    //     .anyOf(tagToBeRemoved)
    //     .modify((file) => {
    //       const tagToBeRemovedIndex = file.tags.findIndex((tag) => tag === tagToBeRemoved);
    //       if (tagToBeRemovedIndex !== -1) {
    //         file.tags[tagToBeRemovedIndex] = tagToMergeWith;
    //         // Might contain duplicates if the tag to be merged with was already on the file, so remove duplicates.
    //         retainArray(
    //           file.tags.slice(tagToBeRemovedIndex + 1),
    //           (tag) => tag !== tagToMergeWith || tag !== tagToBeRemoved,
    //         );
    //       }
    //     });
    //   // Remove tag from DB
    //   this.#tags.delete(tagToBeRemoved);
    // });
    // this.#notifyChange();
  }

  async removeFiles(files: ID[]): Promise<void> {
    console.info('Better-SQLite3: Removing files...', files);
    await this.#db.delete(filesTable).where(inArray(filesTable.id, files));
    this.#notifyChange();
  }

  async removeLocation(location: ID): Promise<void> {
    // sub locations should be cascaded and deleted
    // TODO, do we delete files? I can't figure out how to original project does it

    console.info('Better-SQLite3: Removing location...', location);
    await this.#db.delete(locationsTable).where(eq(locationsTable.id, location));

    // console.info('IndexedDB: Removing location...', location);
    // await this.#db.transaction('rw', this.#files, this.#locations, () => {
    //   this.#files.where('locationId').equals(location).delete();
    //   this.#locations.delete(location);
    // });
    this.#notifyChange();
  }

  async removeSearch(search: ID): Promise<void> {
    // console.info('IndexedDB: Removing search...', search);
    // await this.#searches.delete(search);
    // this.#notifyChange();
  }

  async removeExtraProperties(extraPropertyIDs: ID[]): Promise<void> {
    // console.info('IndexedDB: Removing extra properties...', extraPropertyIDs);
    // await this.#db.transaction('rw', this.#files, this.#extraProperties, async () => {
    //   await this.#files
    //     .where('extraPropertyIDs')
    //     .anyOf(extraPropertyIDs)
    //     .distinct()
    //     .modify((file) => {
    //       for (const id of extraPropertyIDs) {
    //         delete file.extraProperties[id];
    //       }
    //       retainArray(file.extraPropertyIDs, (id) => !extraPropertyIDs.includes(id));
    //     });
    //   await this.#extraProperties.bulkDelete(extraPropertyIDs);
    // });
    // this.#notifyChange();
  }

  async countFiles(): Promise<[fileCount: number, untaggedFileCount: number]> {
    return [0, 0];
    // console.info('IndexedDB: Getting number stats of files...');
    // return this.#db.transaction('r', this.#files, async () => {
    //   // Aparently converting the whole table into array and check tags in a for loop is a lot faster than using a where tags filter followed by unique().
    //   const files = await this.#files.toArray();
    //   let unTaggedFileCount = 0;
    //   for (let i = 0; i < files.length; i++) {
    //     if (files[i].tags.length === 0) {
    //       unTaggedFileCount++;
    //     }
    //   }
    //   return [files.length, unTaggedFileCount];
    // });
  }

  // Creates many files at once, and checks for duplicates in the path they are in
  async createFilesFromPath(path: string, files: FileDTO[]): Promise<void> {
    console.info('Better-SQLite3: Creating files...', path, files);
    // previously we did filter getting all the paths that start with the base path using where('absolutePath').startsWith(path).keys()
    // but converting to an array and extracting the paths is significantly faster than .keys()
    // Also, for small batches of new files, checking each path individually is faster.
    console.debug('Filtering files...');

    console.debug('Creating files...');
    let filesData: FilesDB[] = [];

    // We exceed maximum call stack if we do 10k at once, so we limit to batches of 1k
    // Relevant issue: https://github.com/drizzle-team/drizzle-orm/issues/1740
    let i = 0;
    const BATCH_SIZE = 1000;
    for (const file of files) {
      filesData.push(this.fileDBConverter(file));
      if (i > BATCH_SIZE) {
        await this.#db.insert(filesTable).values(filesData);
        filesData = [];
        i = 0;
      }
      i += 1;
    }
    if (filesData.length > 0) {
      await this.#db.insert(filesTable).values(filesData);
    }
    console.debug('Better-SQLite3: Done Creating Files!');
    this.#notifyChange();
    return;
    // console.info('IndexedDB: Creating files...', path, files);
    // await this.#db.transaction('rw', this.#files, async () => {
    //   // previously we did filter getting all the paths that start with the base path using where('absolutePath').startsWith(path).keys()
    //   // but converting to an array and extracting the paths is significantly faster than .keys()
    //   // Also, for small batches of new files, checking each path individually is faster.
    //   console.debug('Filtering files...');
    //   if (files.length > 500) {
    //     // When creating a large number of files (likely adding a big location),
    //     // it's faster to fetch all existing paths starting with the given base path.
    //     const existingFilePaths = new Set(
    //       (await this.#files.where('absolutePath').startsWith(path).toArray()).map(
    //         (f) => f.absolutePath,
    //       ),
    //     );
    //     retainArray(files, (file) => !existingFilePaths.has(file.absolutePath));
    //   } else {
    //     // For small batches, check each file path individually.
    //     const checks = await Promise.all(
    //       files.map(async (file) => {
    //         const count = await this.#files.where('absolutePath').equals(file.absolutePath).count();
    //         return count === 0;
    //       }),
    //     );
    //     retainArray(files, (_, i) => checks[i]);
    //   }
    //   console.debug('Creating files...');
    //   this.#files.bulkAdd(files);
    // });
    // console.debug('Done!');
    // this.#notifyChange();
  }

  async clear(): Promise<void> {
    // console.info('IndexedDB: Clearing database...');
    // Dexie.delete(this.#db.name);
  }
}
