AI File Translator Service (OpenRouter + LangChain-style chunking + Redis-queue parallelism)

Overview
- Service translates files (txt, pdf, docx, xlsx, pptx) via AI.
- Text is chunked to fit model context, enqueued, processed in parallel workers, re-aggregated, and rebuilt to a downloadable file.
- Unit tests (18 cases) validate core flows: input validation, chunking, queue interactions, worker success/failure, language switching, and download flow.

Architecture
Flow
1) Upload: receive fileBuffer and fileName.
2) Parse: extract text according to extension (parser factory).
3) Chunk: split long text into overlapping chunks (context-friendly).
4) Queue: push translation jobs to Redis queue (one per chunk).
5) Worker: pulls jobs, calls OpenRouter model, stores partials.
6) Aggregate: join chunk translations in original order.
7) Rebuild: produce output buffer and filename base.lang.ext.
8) Download: return artifact to client.

Key Modules
- src/FileTranslatorService.js
  - validateFile(fileName, buffer)
  - validateLang(code, role)
  - translateFile(buffer, fileName, sourceLang, targetLang)
  - processJob(jobData)
  - aggregateResults(jobId)
  - rebuildFile(translatedText, ext)
  - downloadFile(jobId)
  - buildOutputFileName(original, targetLang)
- src/parsers.js
  - BaseParser, TextParser, PdfParser, DocxParser, XlsxParser, PptxParser
  - createParser(ext)
- src/queue/RedisQueue.js
  - add(queueName, payload), consume(queueName, handler), ack(), nack(), stats()
- src/clients/OpenRouterClient.js
  - translate({ text, sourceLang, targetLang })
- src/workers/translatorWorker.js
  - run(): one-shot consumer using RedisQueue stub and OpenRouter client

Environment Configuration
Create .env (example below). The client reads these via process.env in production usage:
OPENROUTER_API_KEY=YOUR_API_KEY
OPENROUTER_BASE_URL=OPEN_ROUTER
OPENROUTER_MODEL=CHOOSE_MODEL

Installation
- Requires Node.js 18+
- Install dependencies
  npm install

Testing
- Jest is preconfigured in package.json
  npm test

Unit Test Coverage (18 cases)
translateFile
- Happy path: long text -> multiple chunks enqueued.
- Language switch: vi -> ja respected.
- Source auto: sourceLang = auto accepted.
- Invalid languages rejected (source/target).
- Unsupported extension rejected (.zip).
- Non-buffer input rejected.
- Empty buffer rejected.
- Oversized file rejected (custom limit).
- Parser empty text rejected.
- Custom splitter respected (exact chunk count).
processJob
- Success: stores part, ack called, downloadable includes translated text.
- Failure: records error, nack called, download throws aggregate error.
aggregate & download
- Aggregates out-of-order parts into correct order.
- Download nonexistent job throws.
- Download before results throws (no parts).
- Output filename includes target language.
Redis failures
- Queue add failure bubbles (translateFile rejects).

Supported Formats and Parsers
- TXT: TextParser
- PDF: PdfParser (placeholder: returns UTF-8 text; replace with pdf-parse/pdfjs in prod)
- DOCX: DocxParser (placeholder: replace with mammoth)
- XLSX: XlsxParser (placeholder: replace with xlsx)
- PPTX: PptxParser (placeholder: replace with office parser)

Feature Scenarios + Example Testable Behaviors
- Change translation language: set targetLang (e.g., en -> ja).
- Download language: rebuilt filename pattern base.{target}.ext (e.g., report.ja.pdf).
- Chunk ordering: assembly preserves original order by index.
- Special content: emojis/markdown preserved by system prompt.
- Error handling: bad API key, API 5xx, Redis connectivity, partial job failures (aggregate throws).
- Large files: produce many chunks, still enqueue and process.
- Edge text: empty/whitespace-only text is rejected.

Usage Examples
- Translate submission (server-side enqueue)
  const { createParser } = require('./src/parsers');
  const FileTranslatorService = require('./src/FileTranslatorService');
  const RedisQueue = require('./src/queue/RedisQueue');

  async function submitTranslation(fileBuffer, fileName, sourceLang, targetLang) {
    const ext = require('path').extname(fileName).toLowerCase();
    const parser = createParser(ext);
    const queue = new RedisQueue({ defaultQueueName: 'translation-jobs' });

    const service = new FileTranslatorService({
      fileParser: parser,
      redisQueue: queue,
      aiClient: { translate: async () => '' } // not used on enqueue side
    });

    const { jobId, chunkCount } = await service.translateFile(
      fileBuffer,
      fileName,
      sourceLang,
      targetLang
    );
    return { jobId, chunkCount };
  }

- Worker processing (development stub)
  const { run } = require('./src/workers/translatorWorker');
  run().then(() => console.log('Worker finished'));

- Aggregate + download (after all chunks processed)
  // Using same service/resultStore instance that worker wrote to in-memory.
  const out = service.downloadFile(jobId);
  // out.fileName -> base.lang.ext
  // out.buffer   -> translated UTF-8 content

Production Notes
- Replace RedisQueue stub with a real queue (BullMQ / ioredis / Redis Streams).
- Replace parsers with production libs to preserve structure/formatting.
- Persist resultStore to Redis/DB to allow multi-instance workers and restart resiliency.
- For PPTX/DOCX/XLSX rebuilding, maintain structure by mapping chunk positions back into documents (requires parser-level mapping metadata).
- Implement retry/backoff for transient OpenRouter errors; implement circuit breaker and observability (metrics, logs).

Troubleshooting
- OpenRouter API key: ensure OPENROUTER_API_KEY present and valid for your base URL.
- Model ID: set OPENROUTER_MODEL to a supported model (currently gpt-5 per .env).
- API errors: the OpenRouter client throws detailed errors including status code and body.
- Queue not processing: ensure worker is running and consuming from the same queue name.
- Tests fail due to environment: unit tests mock AI/Redis and do not invoke network calls.

Repository Structure
/ (root)
- package.json
- .env
- README.md
- src/
  - FileTranslatorService.js
  - parsers.js
  - clients/
    - OpenRouterClient.js
  - queue/
    - RedisQueue.js
  - workers/
    - translatorWorker.js
- tests/
  - FileTranslatorService.test.js

License
- MIT