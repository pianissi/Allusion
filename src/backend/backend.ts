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
  fileSearchTable,
  fileSearchCriteriasTable,
  extraPropertiesTable,
} from './schema';
import { ROOT_TAG_ID, TagDTO } from 'src/api/tag';
import {
  and,
  count,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  SQL,
  sql,
} from 'drizzle-orm';

import fse from 'fs-extra';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import 'dotenv/config';
import { IndexableType } from 'dexie';
import {
  ConditionDTO,
  OrderBy,
  OrderDirection,
  PropertyKeys,
  StringProperties,
} from 'src/api/data-storage-search';
import { ExtraPropertyDTO, ExtraProperties, ExtraPropertyType } from 'src/api/extraProperty';
import { FileDTO } from 'src/api/file';
import { FileSearchDTO } from 'src/api/file-search';
import { ID } from 'src/api/id';
import { LocationDTO, SubLocationDTO } from 'src/api/location';
import * as schema from './schema';
import BetterSQLite3 from 'better-sqlite3';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { SearchCriteria } from 'src/api/search-criteria';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { DB_NAME, dbSQLInit } from './config';

type TagsDB = typeof tagsTable.$inferInsert;
type SubTagsDB = typeof subTagsTable.$inferInsert;
type ImpliedTagsDB = typeof impliedTagsTable.$inferInsert;
type TagAliasesDB = typeof tagAliasesTable.$inferInsert;

type FilesDB = typeof filesTable.$inferInsert;
type FileTagsDB = typeof fileTagsTable.$inferInsert;

type FileExtraPropertiesDB = typeof fileExtraPropertiesTable.$inferInsert;

type LocationsDB = typeof locationsTable.$inferInsert;
type SubLocationsDB = typeof subLocationsTable.$inferInsert;
type LocationTagsDB = typeof locationTagsTable.$inferInsert;
type SubLocationTagsDB = typeof subLocationTagsTable.$inferInsert;

type FileData = typeof filesTable.$inferSelect & {
  fileTags: string;
  fileExtraProperties: string;
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

// TODO, tasks on the backend currently block the UI thread, such as using the autotagger, consider moving this to a webworker or another process
export default class Backend implements DataStorage {
  #db: BetterSQLite3Database<typeof schema>;
  #sqliteDb: BetterSQLite3.Database;
  #notifyChange: () => void;

  constructor(db: BetterSQLite3.Database, notifyChange: () => void) {
    console.info('Drizzle(Better-SQLite3): Initializing database ...');

    this.#db = drizzle({ client: db, schema: schema });
    this.#sqliteDb = db;
    // Migration
    ////////////////

    migrate(this.#db, { migrationsFolder: 'drizzle' });

    this.#notifyChange = notifyChange;
  }

  static async init(db: BetterSQLite3.Database, notifyChange: () => void): Promise<Backend> {
    const backend = new Backend(db, notifyChange);
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

  async querySearch(
    criteria: ConditionDTO<FileDTO> | ConditionDTO<FileDTO>[],
    order: OrderBy<FileDTO>,
    fileOrder: OrderDirection,
    useNaturalOrdering: boolean,
    extraPropertyID?: ID,
    matchAny?: boolean,
  ): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Executing search query...', { criteria, matchAny });

    // FILTERS
    ////////////////////////////////////////////////////////////////////////////////////////////////////////

    const filters = [];

    let criterias = [];
    if (Array.isArray(criteria)) {
      criterias = criteria;
    } else {
      criterias.push(criteria);
    }

    for (const crit of criterias) {
      // Because of the table we construct, we cannot use the actual table name given to the function, but the one of the joined values
      const joinedKey = sql.raw(`f."${crit.key}"`);

      // TODO only push filters at end of loopp
      // Tag Handling
      /////////////////////////////
      // We get a list of tags
      if (crit.valueType === 'indexSignature') {
        // ExtraProperties Handling
        /////////////////////////////

        // These are mainly for extra properties
        // first we have to destructure the actual value

        // We filter them by pushing the fileIds which match the query
        const [propertyId, value] = crit.value;

        if (crit.operator === 'existsInFile') {
          const fileArray = await this.#db
            .select({ id: fileExtraPropertiesTable.file })
            .from(fileExtraPropertiesTable)
            .where(eq(fileExtraPropertiesTable.extraProperties, value));

          filters.push(inArray(sql`f."id"`, fileArray));
        } else if (crit.operator === 'notExistsInFile') {
          const fileArray = await this.#db
            .select({ id: fileExtraPropertiesTable.file })
            .from(fileExtraPropertiesTable)
            .where(eq(fileExtraPropertiesTable.extraProperties, value));

          filters.push(notInArray(sql`f."id"`, fileArray));
        } else if (typeof value === 'string') {
          // Handle String Type for Extra Properties
          ////////////////////////////////////////////////

          let propertyFilter = sql.empty();

          if (crit.operator === 'equalsIgnoreCase') {
            propertyFilter = like(fileExtraPropertiesTable.value, value);
          } else if (crit.operator === 'equals') {
            propertyFilter = like(
              sql.raw(`UPPER(${fileExtraPropertiesTable.value})`),
              sql.raw(`UPPER(${value})`),
            );
          } else if (crit.operator === 'notEqual') {
            propertyFilter = not(like(fileExtraPropertiesTable.value, value));
          } else {
            // TODO: SQLite natively doesn't really support UPPER() on Unicode characters,
            // Consider loading sqlean as an extension

            // Because % is a wildcard, we have to escape the character
            let wildcardValue = value.replaceAll('%', '\\%') + '%';
            if (crit.operator === 'startsWith') {
              propertyFilter = like(fileExtraPropertiesTable.value, wildcardValue);
            } else if (crit.operator === 'startsWithIgnoreCase') {
              propertyFilter = like(
                sql.raw(`UPPER(${fileExtraPropertiesTable.value})`),
                sql.raw(`UPPER(${value})`),
              );
            } else if (crit.operator === 'notStartsWith') {
              propertyFilter = not(like(fileExtraPropertiesTable.value, wildcardValue));
            } else {
              // if comparison doesn't do startsWith, we add a wildcard to the front
              wildcardValue = '%' + wildcardValue;
              if (crit.operator === 'contains') {
                propertyFilter = like(fileExtraPropertiesTable.value, wildcardValue);
              } else if (crit.operator === 'notContains') {
                propertyFilter = not(like(fileExtraPropertiesTable.value, wildcardValue));
              }
            }
          }
          const fileArray = await this.#db
            .select({ id: fileExtraPropertiesTable.file })
            .from(fileExtraPropertiesTable)
            .where(propertyFilter);

          filters.push(inArray(sql`f."id"`, fileArray));
        } else if (typeof value === 'number') {
          // Handle Number Type for Extra Properties
          /////////////////////////////////////////////
          const EPSILON = 0.00000001;

          let propertyFilter = sql.empty();
          if (crit.operator === 'equals') {
            // If it is a real type a.k.a a float, then we need to use an epsilon comparison
            if (Number.isInteger(value)) {
              propertyFilter = eq(fileExtraPropertiesTable.value, value);
            } else {
              propertyFilter = sql`ABS(${fileExtraPropertiesTable.value} - ${value}) < ${EPSILON}`;
            }
          } else if (crit.operator === 'notEqual') {
            if (Number.isInteger(value)) {
              propertyFilter = ne(fileExtraPropertiesTable.value, value);
            } else {
              propertyFilter = sql`ABS(${fileExtraPropertiesTable.value} - ${value}) >= ${EPSILON}`;
            }
          } else if (crit.operator === 'smallerThan') {
            propertyFilter = lt(fileExtraPropertiesTable.value, value);
          } else if (crit.operator === 'smallerThanOrEquals') {
            propertyFilter = lte(fileExtraPropertiesTable.value, value);
          } else if (crit.operator === 'greaterThan') {
            propertyFilter = gt(fileExtraPropertiesTable.value, value);
          } else if (crit.operator === 'greaterThanOrEquals') {
            propertyFilter = gte(fileExtraPropertiesTable.value, value);
          }

          const fileArray = await this.#db
            .select({ id: fileExtraPropertiesTable.file })
            .from(fileExtraPropertiesTable)
            .where(propertyFilter);

          filters.push(inArray(sql`f."id"`, fileArray));
        }
      } else if (crit.key === 'tags') {
        // If it's a length of 0, then it is looking for untagged images
        if (crit.value.length === 0) {
          // This just gets all images with tags
          const result = await this.#db
            .selectDistinct({ id: fileTagsTable.file })
            .from(fileTagsTable);
          const fileArray: string[] = [];
          for (const res of result) {
            if (typeof res.id === 'string') {
              fileArray.push(res.id);
            }
          }
          // Reverse for untagged images
          if (crit.operator === 'contains') {
            filters.push(notInArray(sql`f."id"`, fileArray));
          } else if (crit.operator === 'notContains') {
            filters.push(inArray(sql`f."id"`, fileArray));
          }
        } else {
          const tagList = [];
          if (typeof crit.value === 'string') {
            tagList.push(crit.value);
          } else if (Array.isArray(crit.value)) {
            tagList.push(...crit.value);
          }

          // This gets images which have tags and is in our tag list
          const result = await this.#db
            .select({ id: fileTagsTable.file })
            .from(fileTagsTable)
            .where(inArray(fileTagsTable.tag, tagList));

          // Forcing the result to be strings,
          // not sure if this could be better
          const fileArray: string[] = [];
          for (const res of result) {
            if (typeof res.id === 'string') {
              fileArray.push(res.id);
            }
          }

          if (crit.operator === 'contains') {
            filters.push(inArray(sql`f."id"`, fileArray));
          } else if (crit.operator === 'notContains') {
            filters.push(notInArray(sql`f."id"`, fileArray));
          }
        }
      } else if (crit.key === 'extension') {
        // Extension Handling
        /////////////////////////////
        if (crit.operator === 'equals') {
          filters.push(like(joinedKey, crit.value));
        } else if (crit.operator === 'notEqual') {
          filters.push(not(like(joinedKey, crit.value)));
        }
      } else if (crit.valueType === 'number') {
        // Number Handling
        ///////////////////
        const EPSILON = 0.00000001;
        if (crit.operator === 'equals') {
          // If it is a real type a.k.a a float, then we need to use an epsilon comparison
          if (Number.isInteger(crit.value)) {
            filters.push(eq(joinedKey, crit.value));
          } else {
            filters.push(sql`ABS(${joinedKey} - ${crit.value}) < ${EPSILON}`);
          }
        } else if (crit.operator === 'notEqual') {
          if (Number.isInteger(crit.value)) {
            filters.push(ne(joinedKey, crit.value));
          } else {
            filters.push(sql`ABS(${joinedKey} - ${crit.value}) >= ${EPSILON}`);
          }
        } else if (crit.operator === 'smallerThan') {
          filters.push(lt(joinedKey, crit.value));
        } else if (crit.operator === 'smallerThanOrEquals') {
          filters.push(lte(joinedKey, crit.value));
        } else if (crit.operator === 'greaterThan') {
          filters.push(gt(joinedKey, crit.value));
        } else if (crit.operator === 'greaterThanOrEquals') {
          filters.push(gte(joinedKey, crit.value));
        }
      } else if (crit.valueType === 'date') {
        // Separate strategy for if it is a date since usually refers to a time range
        const DAY_MILLISECONDS = 86400000;
        const minTime = crit.value.getTime();
        const maxTime = minTime + DAY_MILLISECONDS - 1;
        // maxTime will be the second right before the date ticks over.
        // i.e., minTime = 00:00, maxTime = 23:59

        if (crit.operator === 'equals') {
          // check if between
          filters.push(sql`ABS(${joinedKey} - ${minTime}) < ${DAY_MILLISECONDS}`);
        } else if (crit.operator === 'notEqual') {
          filters.push(sql`ABS(${joinedKey} - ${minTime}) < ${DAY_MILLISECONDS}`);
        } else if (crit.operator === 'smallerThan') {
          filters.push(lt(joinedKey, minTime));
        } else if (crit.operator === 'smallerThanOrEquals') {
          filters.push(lt(joinedKey, maxTime));
        } else if (crit.operator === 'greaterThan') {
          filters.push(gt(joinedKey, maxTime));
        } else if (crit.operator === 'greaterThanOrEquals') {
          filters.push(gte(joinedKey, minTime));
        }
      } else if (typeof crit.value === 'string') {
        // String Handling
        /////////////////////////////
        let value = crit.value;
        if (crit.operator === 'equalsIgnoreCase') {
          filters.push(like(joinedKey, value));
        } else if (crit.operator === 'equals') {
          filters.push(like(sql.raw(`UPPER(${joinedKey})`), sql.raw(`UPPER(${value})`)));
        } else if (crit.operator === 'notEqual') {
          filters.push(not(like(joinedKey, value)));
        } else {
          // TODO: SQLite natively doesn't really support UPPER() on Unicode characters,
          // Consider loading sqlean as an extension

          // Because % is a wildcard, we have to escape the character
          value = crit.value.replaceAll('%', '\\%') + '%';
          if (crit.operator === 'startsWith') {
            filters.push(like(joinedKey, value));
          } else if (crit.operator === 'startsWithIgnoreCase') {
            filters.push(like(sql.raw(`UPPER(${joinedKey})`), sql.raw(`UPPER(${value})`)));
          } else if (crit.operator === 'notStartsWith') {
            filters.push(not(like(joinedKey, value)));
          } else {
            // if comparison doesn't do startsWith, we add a wildcard to the front
            value = '%' + value;
            if (crit.operator === 'contains') {
              filters.push(like(joinedKey, value));
            } else if (crit.operator === 'notContains') {
              filters.push(not(like(joinedKey, value)));
            }
          }
        }
      }
    }
    // We can have more complex expressions if this match any was just nested criterias with strategies, but don't know if people would use it
    let filter: SQL | undefined = undefined;
    if (filters.length > 0) {
      if (matchAny) {
        filter = or(...filters) || sql.empty();
      } else {
        filter = and(...filters) || sql.empty();
      }
    }

    // SORTING
    ////////////////////////////////////////////////////////////////////////////////////////
    const orderQuery: SQL = sql`ORDER BY`;

    console.log(order);

    if (order === 'extraProperty') {
      // because of how the joined table is returned as, we need to aggregate a sort value in the joined table which can be used as a key
      order = 'dateAdded';
      orderQuery.append(sql` fe."sortValue" `);
    }
    if (order === 'random') {
      orderQuery.append(sql` RANDOM()`);
    } else if (useNaturalOrdering && isFileDTOPropString(order)) {
      // We order by the key given to us, which is stored as order,
      orderQuery.append(sql.raw(` PAD_STRING(f."${order}")`));
    } else {
      orderQuery.append(sql.raw(` f."${order}"`));
    }

    if (fileOrder === OrderDirection.Desc) {
      orderQuery.append(sql` DESC`);
    } else {
      orderQuery.append(sql` ASC`);
    }

    // QUERY
    ////////////////////////////////////////////
    const filesData = await this.queryFiles({
      filter: filter,
      orderQuery: orderQuery,
      extraPropertyID: extraPropertyID,
    });
    const result = filesDTOConverter(filesData);
    return result;
  }

  async queryFiles(options: {
    filter?: SQL;
    orderQuery?: SQL;
    extraPropertyID?: ID;
  }): Promise<FileData[]> {
    let where = sql.empty();
    if (options.filter) {
      where = sql`WHERE ${options.filter}`;
    }

    let orderBy = sql.empty();
    if (options.orderQuery) {
      orderBy = options.orderQuery;
    }

    let sortValue = sql`NULL as "sortValue"`;
    if (options.extraPropertyID) {
      sortValue = sql`MAX(CASE WHEN fe."extraProperties" = ${options.extraPropertyID} THEN fe."value" END) AS "sortValue"`;
    }
    return this.#db.all(
      sql`WITH fileExtra AS (
        SELECT
            "file",
            json_group_array(json_object('value', "value", 'extraProperties', "extraProperties", 'file', "file")) AS "fileExtraProperties",
            ${sortValue}
        FROM "fileExtraProperties"
        GROUP BY "file"
      ),
      fileTagAgg AS (
          SELECT
              "file",
              json_group_array(json_object('tag', "tag", 'file', "file")) AS "fileTags"
          FROM "fileTags"
          GROUP BY "file"
      )
      SELECT
          f."id",
          f."ino",
          f."locationId",
          f."relativePath",
          f."absolutePath",
          f."dateAdded",
          f."dateModified",
          f."origDateModified",
          f."dateLastIndexed",
          f."dateCreated",
          f."name",
          f."extension",
          f."size",
          f."width",
          f."height",
          fe."sortValue",
          COALESCE(fe."fileExtraProperties", json_array()) AS "fileExtraProperties",
          COALESCE(ft."fileTags", json_array()) AS "fileTags"
      FROM "files" f
      LEFT JOIN fileExtra fe ON fe."file" = f."id"
      LEFT JOIN fileTagAgg ft ON ft."file" = f."id"
      ${where}
      ${orderBy};`,
    ) as FileData[];
  }
  async fetchFiles(
    order: OrderBy<FileDTO>,
    fileOrder: OrderDirection,
    useNaturalOrdering: boolean,
    extraPropertyID?: ID,
  ): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Fetching files...');

    const result = this.querySearch([], order, fileOrder, useNaturalOrdering, extraPropertyID);
    console.info('Better-SQLite3: Fetched files', result);
    return result;
  }

  async fetchFilesByID(ids: ID[]): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Fetching files by ID...');
    // I don't like how `f."id"` is sort of a magic string, might be better as a macro
    const filesData = await this.queryFiles({ filter: inArray(sql`f."id"`, ids) });

    return filesDTOConverter(filesData);
  }

  async fetchFilesByKey(key: keyof FileDTO, value: IndexableType): Promise<FileDTO[]> {
    console.info('Better-SQLite3: Fetching files by key/value...', { key, value });

    const dbKey = key as keyof FilesDB;

    const filesData = await this.queryFiles({
      filter: eq(sql.raw(`f."${dbKey}"`), value as string | number),
    });
    return filesDTOConverter(filesData);
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
    console.info('Better-SQLite3: Fetching searches...');
    const fileSearchDatas = await this.#db.query.fileSearchTable.findMany({
      with: {
        searchCriterias: true,
      },
    });
    const fileSearchDTO: FileSearchDTO[] = [];
    for (const searchData of fileSearchDatas) {
      fileSearchDTO.push({
        id: searchData.id,
        name: searchData.name,
        criteria: searchData.searchCriterias.reduce((acc: SearchCriteria[], criteria) => {
          if (criteria.criteria) {
            acc.push(criteria.criteria);
          }
          return acc;
        }, []),
        matchAny: searchData.matchAny || false,
        index: searchData.index,
      });
    }
    return fileSearchDTO;
  }

  async fetchExtraProperties(): Promise<ExtraPropertyDTO[]> {
    console.info('Better-SQLite3: Fetching extra properties...');
    const extraProperties = await this.#db.select().from(extraPropertiesTable);
    const extraPropertiesDTO: ExtraPropertyDTO[] = [];
    for (const extraProperty of extraProperties) {
      extraPropertiesDTO.push({
        id: extraProperty.id,
        type: <ExtraPropertyType>extraProperty.type,
        name: extraProperty.name || '',
        dateAdded: new Date(extraProperty.dateAdded),
      });
    }
    return extraPropertiesDTO;
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

    const result = this.querySearch(
      criteria,
      order,
      fileOrder,
      useNaturalOrdering,
      extraPropertyID,
    );
    return result;
  }

  async createTag(tag: TagDTO): Promise<void> {
    console.info('Better-SQLite3: Creating tag...', tag);
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

    await this.#db.insert(subLocationsTable).values(subLocationData);
    if (locationTagsData.length > 0) {
      await this.#db.insert(subLocationTagsTable).values(locationTagsData);
    }
    for (const child of subLocation.subLocations) {
      this.createSubLocation(child, rootLocation, subLocationData.id);
    }
  }

  async createSearch(search: FileSearchDTO): Promise<void> {
    console.info('Better-SQLite3: Creating search...', search);
    await this.#db.insert(fileSearchTable).values({
      id: search.id,
      name: search.name,
      matchAny: search.matchAny,
      index: search.index,
    });
    for (const critera of search.criteria) {
      await this.#db.insert(fileSearchCriteriasTable).values({
        // Yeah this is just getting stored as a JSON
        criteria: critera,
        // FileSearch is the parent
        fileSearch: search.id,
      });
    }
    this.#notifyChange();
  }

  async createExtraProperty(extraProperty: ExtraPropertyDTO): Promise<void> {
    console.info('Better-SQLite3: Creating extra property...', extraProperty);
    await this.#db.insert(extraPropertiesTable).values({
      id: extraProperty.id,
      type: extraProperty.type,
      name: extraProperty.name,
      dateAdded: extraProperty.dateAdded.getTime(),
    });
    this.#notifyChange();
  }

  async saveTag(tag: TagDTO): Promise<void> {
    // we have to update old entries of subTags
    console.info('Better-SQLite3: Saving tag...', tag);
    const tagsData = {
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
    this.#notifyChange();
  }

  async saveFiles(files: FileDTO[]): Promise<void> {
    console.info('Better-SQLite3: Saving files...', files);
    const filesData: FilesDB[] = [];
    const fileIds = [];
    for (const file of files) {
      filesData.push(fileDBConverter(file));
      fileIds.push(file.id);
    }
    const fileTagsData: FileTagsDB[] = [];
    for (const file of files) {
      for (const tag of file.tags) {
        fileTagsData.push({ tag: tag, file: file.id });
      }
    }

    const fileExtraPropertiesData: FileExtraPropertiesDB[] = [];
    for (const file of files) {
      for (const extraPropertyKey in file.extraProperties) {
        fileExtraPropertiesData.push({
          extraProperties: extraPropertyKey,
          file: file.id,
          value: file.extraProperties[extraPropertyKey],
        });
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

    await this.#db
      .delete(fileExtraPropertiesTable)
      .where(inArray(fileExtraPropertiesTable.file, fileIds));
    if (fileExtraPropertiesData.length > 0) {
      await this.#db.insert(fileExtraPropertiesTable).values(fileExtraPropertiesData);
    }
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
    console.info('Better-SQLite3: Saving search...', search);
    await this.#db
      .update(fileSearchTable)
      .set({
        id: search.id,
        name: search.name,
        matchAny: search.matchAny,
        index: search.index,
      })
      .where(eq(fileSearchTable.id, search.id));
    for (const critera of search.criteria) {
      await this.#db
        .delete(fileSearchCriteriasTable)
        .where(eq(fileSearchCriteriasTable.fileSearch, search.id));
      await this.#db.insert(fileSearchCriteriasTable).values({
        // Yeah this is just getting stored as a JSON
        criteria: critera,
        // FileSearch is the parent
        fileSearch: search.id,
      });
    }
    this.#notifyChange();
  }

  async saveExtraProperty(extraProperty: ExtraPropertyDTO): Promise<void> {
    console.info('Better-SQLite3: Saving extra property...', extraProperty);
    await this.#db
      .update(extraPropertiesTable)
      .set({
        id: extraProperty.id,
        type: extraProperty.type,
        name: extraProperty.name,
        dateAdded: extraProperty.dateAdded.getTime(),
      })
      .where(eq(extraPropertiesTable.id, extraProperty.id));
    this.#notifyChange();
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
    // We update all the fileTag ids to the new tag, and just delete the removed tag record
    console.info('Better-SQLite3: Merging tags...', tagToBeRemoved, tagToMergeWith);

    const fileTags = await this.#db
      .select({ file: fileTagsTable.file })
      .from(fileTagsTable)
      .where(eq(fileTagsTable.tag, tagToBeRemoved));

    console.log('old ft', fileTags);
    const fileTagData: FileTagsDB[] = [];
    for (const fileTag of fileTags) {
      fileTagData.push({
        file: fileTag.file,
        tag: tagToMergeWith,
      });
    }

    console.log('new ft', fileTagData);

    await this.removeTags([tagToBeRemoved]);
    if (fileTagData.length) {
      await this.#db.insert(fileTagsTable).values(fileTagData);
    }
    this.#notifyChange();
  }

  async removeFiles(files: ID[]): Promise<void> {
    console.info('Better-SQLite3: Removing files...', files);
    await this.#db.delete(filesTable).where(inArray(filesTable.id, files));
    this.#notifyChange();
  }

  async removeLocation(location: ID): Promise<void> {
    // sub locations should be cascaded and deleted
    console.info('Better-SQLite3: Removing location...', location);
    await this.#db.delete(locationsTable).where(eq(locationsTable.id, location));
    this.#notifyChange();
  }

  async removeSearch(search: ID): Promise<void> {
    console.info('Better-SQLite3: Removing search...', search);
    // await this.#searches.delete(search);
    await this.#db.delete(fileSearchTable).where(eq(fileSearchTable.id, search));
    this.#notifyChange();
  }

  async removeExtraProperties(extraPropertyIDs: ID[]): Promise<void> {
    console.info('Better-SQLite3: Removing extra properties...', extraPropertyIDs);
    await this.#db
      .delete(extraPropertiesTable)
      .where(inArray(extraPropertiesTable.id, extraPropertyIDs));
    this.#notifyChange();
  }

  async countFiles(): Promise<[fileCount: number, untaggedFileCount: number]> {
    console.info('Better-SQLite3: Getting number stats of files...');
    const fileCount = (await this.#db.select({ count: count() }).from(filesTable))[0];

    const filesTaggedCount = (
      await this.#db
        .select({ count: sql<number>`count(distinct ${filesTable.id})` })
        .from(filesTable)
        .innerJoin(fileTagsTable, eq(fileTagsTable.file, filesTable.id))
    )[0];

    return [fileCount.count, fileCount.count - filesTaggedCount.count];
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
      filesData.push(fileDBConverter(file));
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
  }

  async clear(): Promise<void> {
    // We just delete db on filesystem and reinit

    console.info('Better-SQLite3: Clearing database...');
    // TODO: change DB_NAME to same other class / method variable that can be updated for a portable version
    this.#sqliteDb.close();

    try {
      fse.unlinkSync(DB_NAME);
      console.info('Better-SQLite3: Database deleted successfully');
    } catch (err) {
      console.error('Error deleting file:', err);
    }

    // TODO: reset notify change as it uses an old backup scheduler
    const db = dbSQLInit(DB_NAME);
    this.#db = drizzle({ client: db, schema: schema });
    this.#sqliteDb = db;
    // Migration
    ////////////////

    migrate(this.#db, { migrationsFolder: 'drizzle' });
  }

  async migrate(oldBackend: DataStorage): Promise<void> {
    // Migrating from an old backend
    // We just fetch everything and create stuff in our new backend
    const tagsDTO = await oldBackend.fetchTags();
    const filesDTO = await oldBackend.fetchFiles('id', OrderDirection.Asc, false);
    const locationsDTO = await oldBackend.fetchLocations();
    const searchesDTO = await oldBackend.fetchSearches();
    const extraPropertiesDTO = await oldBackend.fetchExtraProperties();

    // first we create the stores, then save to update the tags / extra properties / any other things that might be missing)
    // 1st pass

    for (const tagDTO of tagsDTO) {
      await oldBackend.createTag(tagDTO);
    }
    await oldBackend.createFilesFromPath('', filesDTO);
    for (const locationDTO of locationsDTO) {
      await oldBackend.createLocation(locationDTO);
    }
    for (const searchDTO of searchesDTO) {
      await oldBackend.createSearch(searchDTO);
    }
    for (const extraPropertyDTO of extraPropertiesDTO) {
      await oldBackend.createExtraProperty(extraPropertyDTO);
    }

    // 2nd pass

    for (const tagDTO of tagsDTO) {
      await oldBackend.saveTag(tagDTO);
    }
    await oldBackend.saveFiles(filesDTO);
    for (const locationDTO of locationsDTO) {
      await oldBackend.saveLocation(locationDTO);
    }
    for (const searchDTO of searchesDTO) {
      await oldBackend.saveSearch(searchDTO);
    }
    for (const extraPropertyDTO of extraPropertiesDTO) {
      await oldBackend.saveExtraProperty(extraPropertyDTO);
    }
  }
}

// TODO put in common file utils

const exampleFileDTO: FileDTO = {
  id: '',
  ino: '',
  name: '',
  relativePath: '',
  absolutePath: '',
  locationId: '',
  extension: 'jpg',
  size: 0,
  width: 0,
  height: 0,
  dateAdded: new Date(),
  dateCreated: new Date(),
  dateLastIndexed: new Date(),
  dateModified: new Date(),
  origDateModified: new Date(),
  extraProperties: {},
  extraPropertyIDs: [],
  tags: [],
};

export function isFileDTOPropString(
  prop: PropertyKeys<FileDTO>,
): prop is StringProperties<FileDTO> {
  return typeof exampleFileDTO[prop] === 'string';
}

function fileDBConverter(file: FileDTO): FilesDB {
  return {
    id: file.id,
    ino: file.ino,
    locationId: file.locationId,
    relativePath: file.relativePath,
    absolutePath: file.absolutePath,
    dateAdded: file.dateAdded.getTime(),
    dateModified: file.dateModified.getTime(),
    origDateModified: file.origDateModified.getTime(),
    dateLastIndexed: file.dateLastIndexed.getTime(),
    dateCreated: file.dateCreated.getTime(),
    name: file.name,
    extension: file.extension,
    size: file.size,
    width: file.width,
    height: file.height,
  };
}

function filesDTOConverter(filesData: FileData[]): FileDTO[] {
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
      origDateModified: new Date(fileData.origDateModified),
      dateLastIndexed: new Date(fileData.dateLastIndexed),
      dateCreated: new Date(fileData.dateCreated),

      name: fileData.name,
      extension: fileData.extension,
      size: fileData.size,
      width: fileData.width,
      height: fileData.height,

      tags: JSON.parse(fileData.fileTags).map((fileTag: FileTagsDB) => fileTag.tag || ''),
      extraProperties: JSON.parse(fileData.fileExtraProperties).reduce(
        (acc: ExtraProperties, fileExtraProperties: FileExtraPropertiesDB) => {
          acc[fileExtraProperties.extraProperties] = fileExtraProperties.value || '';
          return acc;
        },
        {},
      ),
      extraPropertyIDs: JSON.parse(fileData.fileExtraProperties).map(
        (fileExtraProperties: FileExtraPropertiesDB) => {
          return fileExtraProperties.extraProperties;
        },
      ),
    });
    console.log('tag:', fileData.fileTags);
  }
  console.log('dto:', filesDTO[0]);
  return filesDTO;
}
