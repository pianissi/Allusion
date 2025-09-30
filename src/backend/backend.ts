import { DataStorage } from 'src/api/data-storage';
import { impliedTagsTable, subTagsTable, tagAliasesTable, tagsTable } from './schema';
import { ROOT_TAG_ID, TagDTO } from 'src/api/tag';
import { eq, inArray, sql } from 'drizzle-orm';

import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import 'dotenv/config';
import { IndexableType } from 'dexie';
import { ConditionDTO, OrderBy, OrderDirection } from 'src/api/data-storage-search';
import { ExtraPropertyDTO, ExtraProperties } from 'src/api/extraProperty';
import { FileDTO } from 'src/api/file';
import { FileSearchDTO } from 'src/api/file-search';
import { ID } from 'src/api/id';
import { LocationDTO } from 'src/api/location';
import * as schema from './schema';
import Database from 'better-sqlite3';

type TagsDB = typeof tagsTable.$inferInsert;
type SubTagsDB = typeof subTagsTable.$inferInsert;
type ImpliedTagsDB = typeof impliedTagsTable.$inferInsert;
type TagAliasesDB = typeof tagAliasesTable.$inferInsert;

export default class Backend implements DataStorage {
  #db: BetterSQLite3Database<typeof schema>;
  #notifyChange: () => void;

  constructor(notifyChange: () => void) {
    console.info('Drizzle(Better-SQLite3): Initializing database ...');
    // Initialize database tables
    const sqlite = new Database(process.env.DB_FILE_NAME!);
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
    return [];
    // console.info('IndexedDB: Fetching files by ID...');
    // const files = await this.#files.bulkGet(ids);
    // retainArray(files, (file) => file !== undefined);
    // return files as FileDTO[];
  }

  async fetchFilesByKey(key: keyof FileDTO, value: IndexableType): Promise<FileDTO[]> {
    return [];
    // console.info('IndexedDB: Fetching files by key/value...', { key, value });
    // return this.#files.where(key).equals(value).toArray();
  }

  async fetchLocations(): Promise<LocationDTO[]> {
    return [];
    // console.info('IndexedDB: Fetching locations...');
    // return this.#locations.orderBy('dateAdded').toArray();
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
    return [];
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
    this.#db.transaction((tx) => {
      tx.insert(tagsTable).values(tagsData).run();
      if (subTagsData.length > 0) {
        tx.insert(subTagsTable)
          .values(subTagsData)
          .onConflictDoUpdate({
            target: subTagsTable.subTag,
            set: {
              tag: sql`excluded.tag`, // Update the name to the new value
            },
          })
          .run();
      }
      if (impliedTagsData.length > 0) {
        tx.insert(impliedTagsTable).values(impliedTagsData).run();
      }
      if (tagAliasesData.length > 0) {
        tx.insert(tagAliasesTable).values(tagAliasesData).run();
      }
    });
    this.#notifyChange();
  }

  async createLocation(location: LocationDTO): Promise<void> {
    // console.info('IndexedDB: Creating location...', location);
    // await this.#locations.add(location);
    // this.#notifyChange();
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
    this.#db.transaction((tx) => {
      tx.update(tagsTable).set(tagsData).where(eq(tagsTable.id, tag.id)).run();
      if (subTagsData.length > 0) {
        tx.insert(subTagsTable)
          .values(subTagsData)
          .onConflictDoUpdate({
            target: subTagsTable.subTag,
            set: {
              tag: sql`excluded.tag`, // Update the name to the new value
            },
          })
          .run();
      }
      tx.delete(impliedTagsTable).where(eq(impliedTagsTable.tag, tag.id)).run();
      if (impliedTagsData.length > 0) {
        tx.insert(impliedTagsTable).values(impliedTagsData).run();
      }
      tx.delete(tagAliasesTable).where(eq(tagAliasesTable.tag, tag.id)).run();
      if (tagAliasesData.length > 0) {
        tx.insert(tagAliasesTable).values(tagAliasesData).run();
      }
    });

    console.info('IndexedDB: Saving tag...', tag);
    this.#notifyChange();
  }

  async saveFiles(files: FileDTO[]): Promise<void> {
    // console.info('IndexedDB: Saving files...', files);
    // await this.#files.bulkPut(files);
    // this.#notifyChange();
  }

  async saveLocation(location: LocationDTO): Promise<void> {
    // console.info('IndexedDB: Saving location...', location);
    // await this.#locations.put(location);
    // this.#notifyChange();
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
    await this.#db.transaction(async (tx) => {
      tx.delete(tagsTable).where(inArray(tagsTable.id, tags));
      tx.delete(subTagsTable).where(inArray(impliedTagsTable.tag, tags));
      tx.delete(impliedTagsTable).where(inArray(impliedTagsTable.tag, tags));
      tx.delete(tagAliasesTable).where(inArray(tagAliasesTable.tag, tags));
    });
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
    // console.info('IndexedDB: Removing files...', files);
    // await this.#files.bulkDelete(files);
    // this.#notifyChange();
  }

  async removeLocation(location: ID): Promise<void> {
    // console.info('IndexedDB: Removing location...', location);
    // await this.#db.transaction('rw', this.#files, this.#locations, () => {
    //   this.#files.where('locationId').equals(location).delete();
    //   this.#locations.delete(location);
    // });
    // this.#notifyChange();
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
