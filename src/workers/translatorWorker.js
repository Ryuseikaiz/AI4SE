'use strict';

/**
 * Translator worker that consumes queued translation jobs and processes them
 * using OpenRouter client and FileTranslatorService.
 *
 * NOTE:
 *  - This implementation uses the lightweight RedisQueue stub for local/dev.
 *  - In production, replace RedisQueue with a real queue (BullMQ/ioredis).
 */

const RedisQueue = require('../queue/RedisQueue');
const OpenRouterClient = require('../clients/OpenRouterClient');
const FileTranslatorService = require('../FileTranslatorService');

async function run() {
  const queueName = 'translation-jobs';

  // Instantiate dependencies
  const redisQueue = new RedisQueue({ defaultQueueName: queueName });
  const aiClient = new OpenRouterClient({
    // Reads .env for OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL
    appName: 'ai-translator-service-worker'
  });

  // FileTranslatorService is used here only for processJob(), no parser needed
  const service = new FileTranslatorService({
    fileParser: { extractText: async () => '' }, // not used in worker
    redisQueue,
    aiClient
  });

  // Consume all currently enqueued jobs once (one-shot)
  const result = await redisQueue.consume(queueName, async (payload) => {
    await service.processJob(payload);
  });

  console.log(`Worker processed ${result.processed} jobs. ACKs: ${redisQueue.stats().acked}, NACKs: ${redisQueue.stats().nacked}`);
  return result;
}

module.exports = { run };

// Allow running directly: `node src/workers/translatorWorker.js`
if (require.main === module) {
  run().catch((err) => {
    console.error('Worker run failed:', err);
    process.exit(1);
  });
}