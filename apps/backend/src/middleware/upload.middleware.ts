import crypto from 'crypto';
import fs from 'fs';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { MEDIA_POLICY, MediaPolicy } from '../services/media-validation.service';

/**
 * Uploads are streamed by multer into UPLOAD_TMP_DIR under a generated name —
 * never the client's file name — and capped at the documented size while they
 * stream, so an oversized file is cut off rather than buffered.
 *
 * Every temporary file is deleted when the response finishes or the connection
 * closes, whether the request succeeded, failed validation, failed to reach
 * Cloudinary, or was aborted by the client half-way. The services also delete
 * what they create, and `sweepStaleUploads` catches anything a crash left.
 *
 * The client-supplied MIME type is only a cheap early reject; the services
 * decide by decoding (images) or by reading the file's signature (PDF, video).
 */

function removeQuietly(file: string | undefined): void {
  if (!file) return;
  fs.rm(file, { force: true }, () => undefined);
}

/** Registers the clean-up before multer runs, so even an aborted upload is removed. */
function cleanUpWhenDone(req: Request, res: Response, next: NextFunction): void {
  let done = false;
  const cleanUp = () => {
    if (done) return;
    done = true;
    removeQuietly(req.file?.path);
  };
  res.once('finish', cleanUp);
  res.once('close', cleanUp);
  next();
}

const tempStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true }, (error) =>
      callback(error ?? null, env.UPLOAD_TMP_DIR)
    );
  },
  filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`),
});

function diskUpload(field: string, policy: MediaPolicy): RequestHandler[] {
  const parse = multer({
    storage: tempStorage,
    limits: {
      fileSize: policy.maxBytes,
      files: 1,
      // A title is the only text field any upload takes.
      fields: 2,
      fieldSize: 1024,
      parts: 4,
    },
    fileFilter: (_req, file, callback) => {
      if (!policy.mimeTypes.includes(file.mimetype)) {
        callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        return;
      }
      callback(null, true);
    },
  }).single(field);

  return [cleanUpWhenDone, parse];
}

/** POST /profile/photo — field `photo`. */
export const uploadProfilePhoto = diskUpload('photo', MEDIA_POLICY.PROFILE_PHOTO);
/** POST /profile/resume — field `resume`. */
export const uploadResume = diskUpload('resume', MEDIA_POLICY.RESUME);
/** POST /profile/portfolio/photos — field `photo`, optional text field `title`. */
export const uploadPortfolioPhoto = diskUpload('photo', MEDIA_POLICY.PORTFOLIO_PHOTO);
/** POST /profile/portfolio/videos — field `video`, optional text field `title`. */
export const uploadReel = diskUpload('video', MEDIA_POLICY.REEL);
