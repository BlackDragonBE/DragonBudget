import { Router } from 'express';
import multer from 'multer';
import { db } from '../db';
import { parseBnpCsv, CsvFormatError } from '../csv/parse';
import { importTransactions } from '../csv/import';

const MAX_BYTES = 15 * 1024 * 1024;
const single = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } }).single('file');

export const importRouter = Router();

// POST /api/import — multipart CSV upload, returns an import summary.
importRouter.post('/', (req, res, next) => {
  single(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds the 15 MB limit.' });
      }
      return res.status(400).json({ error: 'File upload failed.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    try {
      const rows = parseBnpCsv(req.file.buffer.toString('utf8'));
      res.json(importTransactions(db, rows));
    } catch (e) {
      if (e instanceof CsvFormatError) return res.status(400).json({ error: e.message });
      next(e);
    }
  });
});
