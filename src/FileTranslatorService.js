'use strict';

const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_ALLOWED_EXTS = ['.txt', '.pdf', '.docx', '.xlsx', '.pptx'];
const DEFAULT_ALLOWED_LANGS = ['auto', 'en', 'vi', 'ja', 'zh', 'fr', 'de', 'es', 'ko', 'th', 'id', 'ru', 'pt', 'it', 'ar', 'hi'];
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB

class InMemoryResultStore {
  constructor() {
    this.jobs = new Map(); // jobId -> { meta, parts: Map, errors: [] }
  }

  init(jobId, meta = {}) {
    if (!this.jobs.has(jobId)) {
      this.jobs.set(jobId, { meta, parts: new Map(), errors: [] });
    }
  }

  setMeta(jobId, meta) {
    this.init(jobId);
    const data = this.jobs.get(jobId);
    data.meta = { ...data.meta, ...meta };
  }

  getMeta(jobId) {
    return this.jobs.get(jobId)?.meta || null;
  }

  setPart(jobId, index, text) {
    this.init(jobId);
    this.jobs.get(jobId).parts.set(index, text);
  }

  getParts(jobId) {
    return this.jobs.get(jobId)?.parts || new Map();
  }

  addError(jobId, err) {
    this.init(jobId);
    this.jobs.get(jobId).errors.push(err);
  }

  getErrors(jobId) {
    return this.jobs.get(jobId)?.errors || [];
  }

  clear(jobId) {
    this.jobs.delete(jobId);
  }
}

class SimpleTextSplitter {
  constructor({ chunkSize = 1000, chunkOverlap = 100 } = {}) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  async splitText(text) {
    return this.split(text);
  }

  split(text) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
      const end = Math.min(i + this.chunkSize, text.length);
      const chunk = text.slice(i, end);
      chunks.push(chunk);
      if (end >= text.length) break;
      i = end - this.chunkOverlap;
      if (i < 0) i = 0;
    }
    return chunks;
  }
}

class FileTranslatorService {
  /**
   * @param {object} deps
   * @param {object} deps.fileParser - Dependency to extract text from fileBuffer (extractText(buffer, fileName, ext))
   * @param {object} deps.redisQueue - Queue client (add(queueName, payload), ack?, nack?)
   * @param {object} deps.aiClient - AI client (translate({ text, sourceLang, targetLang }))
   * @param {object} deps.resultStore - Storage for partial results (optional; defaults to in-memory)
   * @param {object} deps.textSplitter - Text splitter with splitText(text) (optional; defaults to SimpleTextSplitter)
   * @param {string[]} deps.allowedExtensions - Supported file extensions
   * @param {string[]} deps.allowedLangs - Supported language codes
   * @param {number} deps.maxFileSizeBytes - Max allowed file size
   */
  constructor({
    fileParser,
    redisQueue,
    aiClient,
    resultStore,
    textSplitter,
    allowedExtensions,
    allowedLangs,
    maxFileSizeBytes
  } = {}) {
    this.fileParser = fileParser;
    this.redisQueue = redisQueue;
    this.aiClient = aiClient;
    this.resultStore = resultStore || new InMemoryResultStore();
    this.textSplitter = textSplitter || new SimpleTextSplitter({ chunkSize: 1000, chunkOverlap: 100 });
    this.allowedExtensions = allowedExtensions || DEFAULT_ALLOWED_EXTS;
    this.allowedLangs = allowedLangs || DEFAULT_ALLOWED_LANGS;
    this.maxFileSizeBytes = maxFileSizeBytes || DEFAULT_MAX_SIZE;
    this.queueName = 'translation-jobs';
  }

  validateFile(fileName, fileBuffer) {
    const ext = path.extname(fileName).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new Error('Định dạng file không được hỗ trợ.');
    }
    if (!fileBuffer || !(fileBuffer instanceof Buffer)) {
      throw new Error('Dữ liệu file không hợp lệ.');
    }
    if (fileBuffer.length === 0) {
      throw new Error('File rỗng hoặc không thể đọc nội dung.');
    }
    if (fileBuffer.length > this.maxFileSizeBytes) {
      throw new Error('Kích thước file vượt quá giới hạn cho phép.');
    }
    return ext;
  }

  validateLang(code, role) {
    if (!code || !this.allowedLangs.includes(code)) {
      throw new Error(`${role} không hợp lệ.`);
    }
  }

  /**
   * Enqueue translation jobs for all text chunks.
   * Returns a jobId to track progress and download result later.
   */
  async translateFile(fileBuffer, originalFileName, sourceLang, targetLang) {
    const ext = this.validateFile(originalFileName, fileBuffer);
    this.validateLang(sourceLang, 'Ngôn ngữ nguồn');
    this.validateLang(targetLang, 'Ngôn ngữ đích');

    const text = await this.fileParser.extractText(fileBuffer, originalFileName, ext);
    if (!text || !String(text).trim()) {
      throw new Error('File rỗng hoặc không thể đọc nội dung.');
    }

    const chunks = (this.textSplitter.splitText
      ? await this.textSplitter.splitText(text)
      : this.textSplitter.split(text));

    const jobId = uuidv4();
    this.resultStore.init(jobId, {
      originalFileName,
      ext,
      sourceLang,
      targetLang,
      chunkCount: chunks.length
    });

    const enqueuePromises = chunks.map((chunk, index) => {
      const payload = { jobId, chunk, index, sourceLang, targetLang, ext };
      return this.redisQueue.add(this.queueName, payload);
    });

    await Promise.all(enqueuePromises);
    return { jobId, chunkCount: chunks.length };
  }

  /**
   * Worker-side: process a single job payload.
   */
  async processJob(jobData) {
    const { jobId, chunk, index, sourceLang, targetLang } = jobData;
    try {
      const translated = await this.aiClient.translate({ text: chunk, sourceLang, targetLang });
      this.resultStore.setPart(jobId, index, translated);
      if (this.redisQueue?.ack) {
        await this.redisQueue.ack(this.queueName, jobData);
      }
      return { ok: true, index };
    } catch (err) {
      this.resultStore.addError(jobId, { index, message: err?.message || String(err) });
      if (this.redisQueue?.nack) {
        await this.redisQueue.nack(this.queueName, jobData, err);
      }
      return { ok: false, index, error: err };
    }
  }

  /**
   * Aggregate partial results in correct order.
   */
  aggregateResults(jobId) {
    const errors = this.resultStore.getErrors(jobId);
    if (errors.length) {
      throw new Error('Một hoặc nhiều tác vụ dịch thất bại.');
    }
    const parts = this.resultStore.getParts(jobId);
    if (!parts || parts.size === 0) {
      throw new Error('Chưa có kết quả dịch để tổng hợp.');
    }
    const ordered = Array.from(parts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, val]) => val);
    return ordered.join('\n');
  }

  /**
   * Rebuild output file. Simplified to plain UTF-8 buffer for all formats.
   */
  rebuildFile(translatedText, ext) {
    return Buffer.from(translatedText, 'utf8');
  }

  /**
   * Produce downloadable artifact for a completed job.
   */
  downloadFile(jobId) {
    const meta = this.resultStore.getMeta(jobId);
    if (!meta) throw new Error('Job không tồn tại.');
    const translated = this.aggregateResults(jobId);
    const buffer = this.rebuildFile(translated, meta.ext);
    const fileName = this.buildOutputFileName(meta.originalFileName, meta.targetLang);
    return { fileName, buffer };
  }

  buildOutputFileName(originalFileName, targetLang) {
    const ext = path.extname(originalFileName);
    const base = path.basename(originalFileName, ext);
    return `${base}.${targetLang}${ext || ''}`;
  }
}

module.exports = FileTranslatorService;