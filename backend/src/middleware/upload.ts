import multer from "multer";
import { env } from "../config/env.js";
import { SUPPORTED_MIME_TYPES } from "../config/constants.js";

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_MIME_TYPES.includes(file.mimetype as any)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Accepted: ${SUPPORTED_MIME_TYPES.join(", ")}`));
    }
  },
});
