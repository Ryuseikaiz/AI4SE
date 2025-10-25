'use strict';

/**
 * OpenRouter API client for translation via chat/completions.
 * This client is not used in unit tests (tests mock aiClient), but provides a production-ready interface.
 *
 * Environment:
 *  - OPENROUTER_API_KEY required
 *  - Optional: OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)
 *  - Optional: OPENROUTER_MODEL (default: openrouter/auto)
 */
class OpenRouterClient {
  /**
   * @param {object} opts
   * @param {string} [opts.apiKey] - API key for OpenRouter (defaults to process.env.OPENROUTER_API_KEY)
   * @param {string} [opts.baseUrl] - Base URL for OpenRouter (defaults to https://openrouter.ai/api/v1)
   * @param {string} [opts.model] - Model identifier (defaults to openrouter/auto)
   * @param {Function} [opts.fetch] - Custom fetch implementation (defaults to globalThis.fetch or dynamic node-fetch import)
   * @param {string} [opts.appName] - Optional app name for headers
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;

    // Normalize base URL to ensure versioned suffix for AgentRouter/OpenRouter compatibility.
    // Accept either ".../api/vN" or ".../vN" as already-versioned.
    const baseRaw = (opts.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const hasVersionPath = /\/(?:api\/)?v\d+$/.test(baseRaw);
    this.baseUrl = hasVersionPath ? baseRaw : `${baseRaw}/v1`;

    this.model = opts.model || process.env.OPENROUTER_MODEL || 'openrouter/auto';
    this.appName = opts.appName || 'ai-translator-service';
    // Some gateways require a valid URL in HTTP-Referer
    this.referer = opts.referer || process.env.OPENROUTER_REFERER || 'https://ai-translator-service.local';
    this.fetch = opts.fetch || globalThis.fetch;

    if (!this.fetch) {
      // Lazy import for Node environments without global fetch
      this.fetch = async (url, init) => {
        const { default: fetch } = await import('node-fetch');
        return fetch(url, init);
      };
    }
  }

  /**
   * Translate a chunk of text from sourceLang to targetLang.
   * @param {object} params
   * @param {string} params.text
   * @param {string} [params.sourceLang='auto']
   * @param {string} [params.targetLang='en']
   * @returns {Promise<string>}
   */
  async translate({ text, sourceLang = 'auto', targetLang = 'en' }) {
    if (!this.apiKey) {
      throw new Error('Thiếu OPENROUTER_API_KEY');
    }
    if (!text || !String(text).trim()) {
      return '';
    }

    const url = `${this.baseUrl}/chat/completions`;
    const messages = [
      {
        role: 'system',
        content: [
          'You are a professional translation engine.',
          `Translate the user content from ${sourceLang} to ${targetLang}.`,
          'Preserve semantic meaning, line breaks, markdown, and basic formatting.',
          'Do not add commentary. Output only the translated content.'
        ].join(' ')
      },
      {
        role: 'user',
        content: text
      }
    ];

    const payload = {
      model: this.model,
      messages,
      temperature: 0
    };

    const headers = {
      'Content-Type': 'application/json',
      // Support both Authorization and X-API-Key for broader gateway compatibility
      'Authorization': `Bearer ${this.apiKey}`,
      'X-API-Key': this.apiKey,
      'HTTP-Referer': this.referer,
      'X-Title': this.appName
    };

    const res = await this.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`OpenRouter API error ${res.status}: ${bodyText}`);
    }

    const data = await res.json().catch(() => null);
    const out = data?.choices?.[0]?.message?.content;
    if (!out) {
      throw new Error('Phản hồi OpenRouter không hợp lệ.');
    }
    return out;
  }
}

module.exports = OpenRouterClient;