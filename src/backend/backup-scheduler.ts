import Dexie from 'dexie';
import { exportDB, importDB, peakImportFile } from 'dexie-export-import';
import fse from 'fs-extra';
import path from 'path';

import { debounce } from '../../common/timeout';
import { DataBackup } from '../api/data-backup';
import { AUTO_BACKUP_TIMEOUT, DB_NAME, dbSQLInit, NUM_AUTO_BACKUPS } from './config';
import BetterSQLite3 from 'better-sqlite3';
import Backend from './backend';
import { app } from 'electron';

/** Returns the date at 00:00 today */
function getToday(): Date {
  const today = new Date();
  today.setHours(0);
  today.setMinutes(0);
  today.setSeconds(0, 0);
  return today;
}

/** Returns the date at the start of the current week (Sunday at 00:00) */
function getWeekStart(): Date {
  const date = getToday();
  const dayOfWeek = date.getDay();
  date.setDate(date.getDate() - dayOfWeek);
  return date;
}

export default class BackupScheduler implements DataBackup {
  #db: BetterSQLite3.Database;
  #backupDirectory: string = '';
  #lastBackupIndex: number = 0;
  #lastBackupDate: Date = new Date(0);

  constructor(db: BetterSQLite3.Database, directory: string) {
    this.#db = db;
    this.#backupDirectory = directory;
  }

  static async init(db: BetterSQLite3.Database, backupDirectory: string): Promise<BackupScheduler> {
    await fse.ensureDir(backupDirectory);
    return new BackupScheduler(db, backupDirectory);
  }

  schedule(): void {
    if (new Date().getTime() > this.#lastBackupDate.getTime() + AUTO_BACKUP_TIMEOUT) {
      this.#createPeriodicBackup();
    }
  }

  /** Creates a copy of a backup file, when the target file creation date is less than the provided date */
  static async #copyFileIfCreatedBeforeDate(
    srcPath: string,
    targetPath: string,
    dateToCheck: Date,
  ): Promise<boolean> {
    let createBackup = false;
    try {
      // If file creation date is less than provided date, create a back-up
      const stats = await fse.stat(targetPath);
      createBackup = stats.ctime < dateToCheck;
    } catch (e) {
      // File not found
      createBackup = true;
    }
    if (createBackup) {
      try {
        await fse.copyFile(srcPath, targetPath);
        console.log('Created backup', targetPath);
        return true;
      } catch (e) {
        console.error('Could not create backup', targetPath, e);
      }
    }
    return false;
  }

  // Wait 10 seconds after a change for any other changes before creating a backup.
  #createPeriodicBackup = debounce(async (): Promise<void> => {
    const filePath = path.join(this.#backupDirectory, `auto-backup-${this.#lastBackupIndex}`);

    this.#lastBackupDate = new Date();
    this.#lastBackupIndex = (this.#lastBackupIndex + 1) % NUM_AUTO_BACKUPS;

    try {
      await this.backupToFile(filePath);

      console.log('Created automatic backup', filePath);

      // Check for daily backup
      await BackupScheduler.#copyFileIfCreatedBeforeDate(
        filePath,
        path.join(this.#backupDirectory, 'daily'),
        getToday(),
      );

      // Check for weekly backup
      await BackupScheduler.#copyFileIfCreatedBeforeDate(
        filePath,
        path.join(this.#backupDirectory, 'weekly'),
        getWeekStart(),
      );
    } catch (e) {
      console.error('Could not create periodic backup', filePath, e);
    }
  }, 10000);

  async backupToFile(path: string): Promise<void> {
    console.info('Better-SQLite3: Exporting database backup...', path);

    // might be nice to zip it and encode as base64 to save space. Keeping it simple for now
    await fse.ensureFile(path);

    const destination = `${path}-backup-${Date.now()}.db`;
    try {
      await this.#db.backup(destination);
      console.info('Better-SQLite3: Database backup saved', destination);
    } catch {
      console.error('Could not export backup', destination);
    }
  }

  async restoreFromFile(path: string): Promise<void> {
    console.info('BetterSQLite3: Importing database backup...', path);
    // This is a bit of a hack, but because we can't exactly just replace the old database without having a reference to the actual backend, we will just replace the db file and restart.
    this.#db.close();

    // TODO: replace with actual variable for portable databases
    // TODO: give some sort of indicator on frontend that the app will restart

    fse.copyFileSync(path, DB_NAME);

    app.relaunch();
    app.exit();
  }

  async peekFile(path: string): Promise<[numTags: number, numFiles: number]> {
    console.info('Better-SQLite3: Peeking database backup...', path);

    // Naive way to do this is just create a backend and fetch everything
    const db = dbSQLInit(path);
    const backend = new Backend(db, () => {});

    const fileCount = (await backend.countFiles())[0];
    const tagCount = (await backend.fetchTags()).length;
    if (fileCount && tagCount) {
      return [fileCount, tagCount];
    }
    throw new Error('Database does not contain a table for files and/or tags');
  }
}
