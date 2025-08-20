import fse from 'fs-extra';
import { action } from 'mobx';
import path from 'path';
import { useEffect } from 'react';

import { thumbnailFormat } from 'common/config';
import { ID } from '../../api/id';
import { ClientFile } from '../entities/File';
import { encodeFilePath, isFileExtensionVideo } from 'common/fs';

export interface IThumbnailMessage {
  filePath: string;
  fileId: ID;
  thumbnailFilePath: string;
  thumbnailFormat: string;
  imageBitmap?: ImageBitmap;
}

export interface IThumbnailMessageResponse {
  fileId: ID;
  thumbnailPath: string;
}

// TODO: Look into NativeImage operators: https://www.electronjs.org/docs/api/native-image#imageresizeoptions

// Set up multiple workers for max performance
const NUM_THUMBNAIL_WORKERS = 4;
const workers: Worker[] = [];
for (let i = 0; i < NUM_THUMBNAIL_WORKERS; i++) {
  workers[i] = new Worker(
    new URL('src/frontend/workers/thumbnailGenerator.worker', import.meta.url),
  );
}

let lastSubmittedWorker = 0;

type Callback = (success: boolean) => void;
/** A map of File ID and a callback function for when thumbnail generation is finished or has failed */
const listeners = new Map<ID, Callback[]>();

/**
 * Generates a thumbnail in a Worker: {@link ../workers/thumbnailGenerator.worker}
 * When the worker is finished, the file.thumbnailPath will be updated with ?v=1,
 * causing the image to update in the view where ever it is used
 **/
export const generateThumbnailUsingWorker = action(
  async (file: ClientFile, thumbnailFilePath: string, timeoutReject = true, timeout = 10000) => {
    const msg: IThumbnailMessage = {
      filePath: file.absolutePath,
      thumbnailFilePath,
      thumbnailFormat,
      fileId: file.id,
    };

    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (listeners.has(msg.fileId)) {
          // Remove the image from the queue when timeout occurs
          workers[lastSubmittedWorker].postMessage({
            type: 'cancel',
            fileId: msg.fileId,
          });
          timeoutReject ? reject() : resolve();
          listeners.delete(msg.fileId);
          //console.debug(`timeout: unable to generate thumbnail for ${file.name}, retrying: ${!timeoutReject}`);
        }
      }, timeout);

      // Might already be in progress if called earlier
      const existingListeners = listeners.get(file.id);
      if (existingListeners) {
        existingListeners.push((success) => (success ? resolve() : reject()));
        return;
      }

      // Otherwise, create a new listener and submit to a worker
      listeners.set(msg.fileId, [(success) => (success ? resolve() : reject())]);
      if (isFileExtensionVideo(file.extension)) {
        // get a frame bitmap using a <video> element and let it handle the video and the decoding.
        // we do this in the main thread and send the ImageBitmap to the worker since workers cannot create DOM elements
        // Todo: it would be more perfomant to do the whole decoding in the worker but that will need a more complex implementation.
        generateVideoThumbnailBitmap(file.absolutePath)
          .then((bitmap) => {
            msg.imageBitmap = bitmap;
            workers[lastSubmittedWorker].postMessage(msg, [bitmap]);
            lastSubmittedWorker = (lastSubmittedWorker + 1) % workers.length;
          })
          .catch((err) => {
            console.error(err);
            reject(err);
          });
      } else {
        workers[lastSubmittedWorker].postMessage(msg);
        lastSubmittedWorker = (lastSubmittedWorker + 1) % workers.length;
      }
    });
  },
);

/**
 * Listens and processes events from the Workers. Should only be used once in the entire app
 * TODO: no need for this to be a hook anymore, should just make a class out of it
 */
export const useWorkerListener = () => {
  useEffect(() => {
    for (let i = 0; i < workers.length; i++) {
      workers[i].onmessage = (e: { data: IThumbnailMessageResponse }) => {
        const { fileId } = e.data;

        const callbacks = listeners.get(fileId);
        if (callbacks) {
          callbacks.forEach((cb) => cb(true));
          listeners.delete(fileId);
        } else {
          console.debug(
            'No callbacks found for fileId after successful thumbnail creation:',
            fileId,
            'Might have timed out',
          );
        }
      };

      workers[i].onerror = (err) => {
        console.error('Could not generate thumbnail', `worker ${i}`, err);
        const fileId = err.message;

        const callbacks = listeners.get(fileId);
        if (callbacks) {
          callbacks.forEach((cb) => cb(false));
          listeners.delete(fileId);
        } else {
          console.debug(
            'No callbacks found for fileId after unsuccessful thumbnail creation:',
            fileId,
            'Might have timed out',
          );
        }
      };
    }
    return () => workers.forEach((worker) => worker.terminate());
  }, []);
};

// Moves all thumbnail files from one directory to another
export const moveThumbnailDir = async (sourceDir: string, targetDir: string) => {
  if (!(await fse.pathExists(sourceDir)) || !(await fse.pathExists(targetDir))) {
    console.log('Source or target directory does not exist for moving thumbnails');
    return;
  }

  console.log('Moving thumbnails from ', sourceDir, ' to ', targetDir);

  const files = await fse.readdir(sourceDir);
  for (const file of files) {
    if (file.endsWith(thumbnailFormat)) {
      const oldPath = path.join(sourceDir, file);
      const newPath = path.join(targetDir, file);
      await fse.move(oldPath, newPath);
    }
  }
};

const generateVideoThumbnailBitmap = async (videoPath: string): Promise<ImageBitmap> => {
  const video = document.createElement('video');
  try {
    video.src = encodeFilePath(videoPath);
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.currentTime = 0;
      };
      video.onseeked = () => {
        video.oncanplay = () => resolve();
      };
      video.onerror = () => reject(new Error('Error loading video for thumbnail'));
    });
    let bitmap = await createImageBitmap(video);
    // Avoid bad thumbnails.
    // If the frame is mostly in a single color (e.g., solid color, blank frame, fade-in transition)
    // generate the bitmap from the middle of the video
    if (isFrameMonotone(bitmap)) {
      video.currentTime = video.duration / 2;
      await new Promise<void>((resolve) => {
        video.onseeked = async () => resolve();
      });
      bitmap.close();
      bitmap = await createImageBitmap(video);
    }
    return bitmap;
  } catch (error) {
    throw error;
  } finally {
    // Cleanup video element with delay to prevent the ImageBitmap to lose the thumbnail information.
    setTimeout(() => {
      video.src = '';
      video.removeAttribute('src');
    }, 10000);
  }
};

/**
 * Check if an ImageBitmap frame is approximately monotone.
 *
 * @param bitmap - The input ImageBitmap to analyze.
 * @param bucketBits - Number of bits kept per channel (default: 4). Lower values mean fewer distinct buckets (more aggressive grouping).
 * @param sampleStep - How many pixels to skip between samples (default: 10). Higher values mean faster processing but less accuracy.
 * @param dominanceThreshold - The fraction of the frame a single bucket must occupy to consider it monotone (default: 0.95).
 * @returns `true` if the frame is considered monotone, `false` otherwise.
 */
const isFrameMonotone = (
  bitmap: ImageBitmap,
  bucketBits = 4,
  sampleStep = 10,
  dominanceThreshold = 0.95,
): boolean => {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No canvas context 2D (should never happen)');
  }
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  const histogram = new Map<number, number>();
  const shift = 8 - bucketBits;
  const step = 4 * sampleStep;
  let total = 0;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i] >> shift;
    const g = data[i + 1] >> shift;
    const b = data[i + 2] >> shift;
    const key = (r << (2 * bucketBits)) | (g << bucketBits) | b;
    histogram.set(key, (histogram.get(key) || 0) + 1);
    total++;
  }

  // find the most frequent bucket
  let maxCount = 0;
  for (const count of histogram.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }
  // if a single bucket exceeds the threshold consider the frame as monotone
  return maxCount / total >= dominanceThreshold;
};
