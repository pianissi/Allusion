import { Directory, Filesystem } from '@capacitor/filesystem';
import { dir } from 'console';
import { Stats } from 'fs-extra';
// import {resolveNativePath} from 'cordova-plugin-filepath';

export interface IFileSystem {
  [key: string]: unknown;
  pathExists: (string) => Promise<boolean>;
  readdir: (string) => Promise<string[]>;
  stat: (string) => Promise<FileStat>;
}

class FileStat {
  // name: string;
  // isDirectory: () => boolean;
  type: FileStatType;
  size: number;
  ctime: Date;
  mtime: Date;
  uri: string;

  isDirectory = () => {
    return this.type === FileStatType.Directory;
  };
  constructor(type: FileStatType, size: number, ctime: Date, mtime: Date, uri: string) {
    this.type = type;
    this.size = size;
    this.ctime = ctime;
    this.mtime = mtime;
    this.uri = uri;
  }
}

enum FileStatType {
  File,
  Directory,
}

declare let window: any;

export async function resolveFileUri(path: string) {
  const convertedPath: string = await new Promise((resolve, reject) => {
    window.FilePath.resolveNativePath(
      path,
      (result) => {
        resolve(result);
      },
      (err) => {
        console.log(err.message, err.code);
        throw new Error(err);
        // reject();
      },
    );
  });
  return convertedPath;
}

class MobileFileSystem implements IFileSystem {
  [key: string]: unknown;
  pathExists = async (path: string) => {
    // const test = await Filesystem.getUri({ path: path, directory: Directory.Documents });
    console.log('test');
    console.log(path);
    // path = await resolveFileUri(path);
    try {
      await Filesystem.stat({
        path: path,
      });
      console.log('success');
      return true;
    } catch {
      return false;
    }
  };
  readdir = async (path: string) => {
    try {
      // path = await resolveFileUri(path);
      const results = (
        await Filesystem.readdir({
          path: path,
        })
      ).files;
      const files = [];
      for (const result of results) {
        files.push(result.uri);
      }
      return files;
    } catch {
      return [];
    }
  };
  stat = async (path: string) => {
    try {
      // path = await resolveFileUri(path);
      const result = await Filesystem.stat({
        path: path,
      });

      let type = FileStatType.File;
      if (result.type === 'directory') {
        type = FileStatType.Directory;
      }

      const fileStat = new FileStat(
        type,
        result.size,
        new Date(result.ctime),
        new Date(result.mtime),
        result.uri,
      );
      // const fileStat: FileStat = {
      //   type,
      //   size: result.size,
      //   ctime: new Date(result.ctime),
      //   mtime: new Date(result.mtime),
      //   uri: result.uri,
      // };
      return fileStat;
    } catch {
      return null;
    }
  };
  // stat
}

export const fs = new MobileFileSystem();
