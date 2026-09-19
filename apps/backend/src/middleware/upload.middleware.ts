import multer from 'multer';
import { UPLOAD_POLICY } from '../services/image.service';

/**
 * Uploads are buffered in memory, capped at the documented size, and handed to
 * the image service for real decoding. Nothing is written to disk until the
 * bytes have been proven to be a decodable image, so a malicious payload never
 * exists as a file.
 *
 * The client-supplied MIME type is only a cheap early reject; `sharp` makes the
 * actual decision in `processProfilePhoto`.
 */
export const uploadProfilePhoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_POLICY.MAX_BYTES,
    files: 1,
    fields: 4,
  },
  fileFilter: (_req, file, callback) => {
    const allowed = UPLOAD_POLICY.ALLOWED_MIME_TYPES as readonly string[];
    if (!allowed.includes(file.mimetype)) {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      return;
    }
    callback(null, true);
  },
}).single('photo');
