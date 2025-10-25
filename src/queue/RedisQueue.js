'use strict';

/**
 * Lightweight Redis-like queue interface for development/testing.
 * Replace with a real implementation using ioredis, bullmq, or Redis Streams in production.
 */
class RedisQueue {
  constructor({ defaultQueueName = 'translation-jobs' } = {}) {
    this.defaultQueueName = defaultQueueName;
    this._queues = new Map(); // name -> payload[]
    this._stats = { acked: 0, nacked: 0 };
  }

  _getQueue(name) {
    const qn = name || this.defaultQueueName;
    if (!this._queues.has(qn)) this._queues.set(qn, []);
    return this._queues.get(qn);
  }

  /**
   * Add a job payload to queue.
   * @param {string} queueName
   * @param {object} payload
   */
  async add(queueName, payload) {
    const q = this._getQueue(queueName);
    q.push(payload);
    return { id: `${queueName}-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  }

  /**
   * Consume all currently enqueued payloads with a handler.
   * Each payload is processed in next tick to simulate async workers.
   * @param {string} queueName
   * @param {Function} handler - async (payload) => void
   */
  async consume(queueName, handler) {
    const q = this._getQueue(queueName);
    const items = q.splice(0, q.length); // drain
    await Promise.all(
      items.map(
        (payload) =>
          new Promise((resolve) =>
            setImmediate(async () => {
              try {
                await handler(payload);
              } catch (e) {
                // handler is expected to call nack on failure
              } finally {
                resolve();
              }
            })
          )
      )
    );
    return { processed: items.length };
  }

  /**
   * Acknowledge a processed job (no-op for this stub).
   */
  async ack(queueName, payload) {
    this._stats.acked += 1;
    return true;
  }

  /**
   * Negative ack a job (record error count).
   */
  async nack(queueName, payload, error) {
    this._stats.nacked += 1;
    return true;
  }

  /**
   * Queue helpers
   */
  size(queueName) {
    return this._getQueue(queueName).length;
  }

  clear(queueName) {
    const q = this._getQueue(queueName);
    q.splice(0, q.length);
  }

  stats() {
    return { ...this._stats };
  }
}

module.exports = RedisQueue;