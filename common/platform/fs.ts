import { Directory, Filesystem } from '@capacitor/filesystem';
import { Stats } from 'fs-extra';
// import {resolveNativePath} from 'cordova-plugin-filepath';

export interface IFileSystem {
  [key: string]: unknown;
  pathExists: (string) => Promise<boolean>;
  readdir: (string) => Promise<string[]>;
  stat: (string) => Promise<Stats>;
}

class MobileFileSystem implements IFileSystem {
  [key: string]: unknown;
  pathExists = async (path: string) => {
    // const test = await Filesystem.getUri({ path: path, directory: Directory.Documents });
    console.log('test');
    console.log(path);
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
    return [];
  };
  stat = async (path: string) => {
    return null;
  };
  // stat
}

export const fs = new MobileFileSystem();
