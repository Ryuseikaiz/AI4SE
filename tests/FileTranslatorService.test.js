'use strict';
const FileTranslatorService = require('../src/FileTranslatorService');

function makeMocks() {
  const fileParser = { extractText: jest.fn() };
  const redisQueue = { add: jest.fn(), ack: jest.fn(), nack: jest.fn() };
  const aiClient = { translate: jest.fn() };
  return { fileParser, redisQueue, aiClient };
}

function makeService(overrides = {}) {
  const { fileParser, redisQueue, aiClient } = makeMocks();
  const service = new FileTranslatorService({
    fileParser: overrides.fileParser || fileParser,
    redisQueue: overrides.redisQueue || redisQueue,
    aiClient: overrides.aiClient || aiClient,
    textSplitter: overrides.textSplitter,
    maxFileSizeBytes: overrides.maxFileSizeBytes,
    allowedLangs: overrides.allowedLangs
  });
  return { service, fileParser, redisQueue, aiClient };
}

describe('FileTranslatorService', () => {
  describe('translateFile', () => {
    it('enqueues multiple jobs for long text (happy path)', async () => {
      const { service, fileParser, redisQueue } = makeService();
      const longText = 'A'.repeat(2500); // ensures > chunkSize
      fileParser.extractText.mockResolvedValue(longText);
      redisQueue.add.mockResolvedValue({ id: 'job' });
      const buffer = Buffer.from('dummy');
      const res = await service.translateFile(buffer, 'document.txt', 'en', 'vi');
      expect(res).toHaveProperty('jobId');
      expect(res.chunkCount).toBeGreaterThan(1);
      expect(redisQueue.add).toHaveBeenCalled();
      expect(redisQueue.add.mock.calls.length).toBeGreaterThan(1);
      // indices should be sequential starting from 0
      const indices = redisQueue.add.mock.calls.map(c => c[1].index);
      expect(indices[0]).toBe(0);
    });

    it('supports changing target language to ja', async () => {
      const { service, fileParser, redisQueue } = makeService();
      fileParser.extractText.mockResolvedValue('short text');
      redisQueue.add.mockResolvedValue({ id: 'job' });
      await service.translateFile(Buffer.from('x'), 'document.txt', 'vi', 'ja');
      const payload = redisQueue.add.mock.calls[0][1];
      expect(payload.targetLang).toBe('ja');
    });

    it('accepts sourceLang auto', async () => {
      const { service, fileParser, redisQueue } = makeService();
      fileParser.extractText.mockResolvedValue('content');
      redisQueue.add.mockResolvedValue({});
      const res = await service.translateFile(Buffer.from('x'), 'document.txt', 'auto', 'en');
      expect(res.chunkCount).toBeGreaterThan(0);
    });

    it('rejects invalid source language', async () => {
      const { service } = makeService();
      await expect(service.translateFile(Buffer.from('x'), 'document.txt', 'xx', 'en')).rejects.toThrow('Ngôn ngữ nguồn không hợp lệ.');
    });

    it('rejects invalid target language', async () => {
      const { service } = makeService();
      await expect(service.translateFile(Buffer.from('x'), 'document.txt', 'en', 'zz')).rejects.toThrow('Ngôn ngữ đích không hợp lệ.');
    });

    it('rejects unsupported extension .zip', async () => {
      const { service } = makeService();
      await expect(service.translateFile(Buffer.from('x'), 'archive.zip', 'en', 'vi')).rejects.toThrow('Định dạng file không được hỗ trợ.');
    });

    it('rejects non-buffer input', async () => {
      const { service } = makeService();
      await expect(service.translateFile('string-data', 'document.txt', 'en', 'vi')).rejects.toThrow('Dữ liệu file không hợp lệ.');
    });

    it('rejects empty buffer', async () => {
      const { service } = makeService();
      await expect(service.translateFile(Buffer.from(''), 'empty.txt', 'en', 'vi')).rejects.toThrow('File rỗng hoặc không thể đọc nội dung.');
    });

    it('rejects oversized file via custom max', async () => {
      const { service } = makeService({ maxFileSizeBytes: 5 });
      await expect(service.translateFile(Buffer.from('1234567890'), 'big.txt', 'en', 'vi')).rejects.toThrow('Kích thước file vượt quá giới hạn cho phép.');
    });

    it('rejects when parser returns empty text', async () => {
      const { service, fileParser } = makeService();
      fileParser.extractText.mockResolvedValue('   ');
      await expect(service.translateFile(Buffer.from('x'), 'document.txt', 'en', 'vi')).rejects.toThrow('File rỗng hoặc không thể đọc nội dung.');
    });

    it('uses custom splitter output', async () => {
      const splitter = { splitText: jest.fn().mockResolvedValue(['C1', 'C2', 'C3']) };
      const { service, fileParser, redisQueue } = makeService({ textSplitter: splitter });
      fileParser.extractText.mockResolvedValue('source content');
      redisQueue.add.mockResolvedValue({});
      const res = await service.translateFile(Buffer.from('x'), 'document.txt', 'en', 'vi');
      expect(res.chunkCount).toBe(3);
      expect(redisQueue.add.mock.calls.length).toBe(3);
      const payloads = redisQueue.add.mock.calls.map(c => c[1]);
      expect(payloads.map(p => p.index)).toEqual([0,1,2]);
    });
  });

  describe('processJob', () => {
    it('stores part and ack on success', async () => {
      const { service, aiClient, redisQueue, fileParser } = makeService();
      aiClient.translate.mockResolvedValue('translated-1');
      fileParser.extractText.mockResolvedValue('A'.repeat(10));
      redisQueue.add.mockResolvedValue({});
      const { jobId } = await service.translateFile(Buffer.from('x'), 'a.txt', 'en', 'vi');
      const payload = { jobId, chunk: 'hello', index: 0, sourceLang: 'en', targetLang: 'vi' };
      const res = await service.processJob(payload);
      expect(res).toEqual({ ok: true, index: 0 });
      expect(redisQueue.ack).toHaveBeenCalledWith('translation-jobs', payload);
      const dl = service.downloadFile(jobId);
      expect(dl.buffer.toString('utf8')).toContain('translated-1');
    });

    it('records error and nack on failure', async () => {
      const { service, aiClient, redisQueue, fileParser } = makeService();
      aiClient.translate.mockRejectedValue(new Error('API down'));
      fileParser.extractText.mockResolvedValue('A'.repeat(10));
      redisQueue.add.mockResolvedValue({});
      const { jobId } = await service.translateFile(Buffer.from('x'), 'a.txt', 'en', 'vi');
      const payload = { jobId, chunk: 'hello', index: 0, sourceLang: 'en', targetLang: 'vi' };
      const res = await service.processJob(payload);
      expect(res.ok).toBe(false);
      expect(redisQueue.nack).toHaveBeenCalledWith('translation-jobs', payload, expect.any(Error));
      expect(() => service.downloadFile(jobId)).toThrow('Một hoặc nhiều tác vụ dịch thất bại.');
    });
  });

  describe('aggregate & download', () => {
    it('aggregates out-of-order parts in correct order', async () => {
      const splitter = { splitText: jest.fn().mockResolvedValue(['C1','C2','C3']) };
      const { service, aiClient, fileParser, redisQueue } = makeService({ textSplitter: splitter });
      fileParser.extractText.mockResolvedValue('src');
      redisQueue.add.mockResolvedValue({});
      aiClient.translate.mockImplementation(({ text }) => 'T(' + text + ')');
      const { jobId } = await service.translateFile(Buffer.from('x'), 'orig.txt', 'en', 'vi');
      await service.processJob({ jobId, chunk: 'C3', index: 2, sourceLang: 'en', targetLang: 'vi' });
      await service.processJob({ jobId, chunk: 'C1', index: 0, sourceLang: 'en', targetLang: 'vi' });
      await service.processJob({ jobId, chunk: 'C2', index: 1, sourceLang: 'en', targetLang: 'vi' });
      const out = service.downloadFile(jobId);
      expect(out.buffer.toString('utf8')).toBe(['T(C1)','T(C2)','T(C3)'].join('\n'));
      expect(out.fileName).toBe('orig.vi.txt');
    });

    it('throws when job not found on download', () => {
      const { service } = makeService();
      expect(() => service.downloadFile('nope')).toThrow('Job không tồn tại.');
    });

    it('throws when no parts available to aggregate', async () => {
      const { service, fileParser, redisQueue } = makeService();
      fileParser.extractText.mockResolvedValue('abc');
      redisQueue.add.mockResolvedValue({});
      const { jobId } = await service.translateFile(Buffer.from('x'), 'a.txt', 'en', 'vi');
      expect(() => service.downloadFile(jobId)).toThrow('Chưa có kết quả dịch để tổng hợp.');
    });

    it('builds output file name with target language', () => {
      const { service } = makeService();
      expect(service.buildOutputFileName('report.pdf','ja')).toBe('report.ja.pdf');
    });
  });

  describe('redis failures', () => {
    it('translateFile rejects when queue add fails', async () => {
      const { fileParser, redisQueue } = makeMocks();
      fileParser.extractText.mockResolvedValue('content');
      redisQueue.add.mockRejectedValue(new Error('Redis connection failed'));
      const service = new FileTranslatorService({ fileParser, redisQueue, aiClient: { translate: jest.fn() } });
      await expect(service.translateFile(Buffer.from('x'), 'doc.txt', 'en', 'vi')).rejects.toThrow('Redis connection failed');
    });
  });
});