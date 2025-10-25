'use strict';

// Minimal loader for .env so tests can pick up OPENROUTER_* values without extra deps
function loadEnvFromDotEnv() {
  const fs = require('fs');
  try {
    const raw = fs.readFileSync('.env', 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) return;
      const key = m[1];
      let val = m[2];
      // Strip surrounding quotes if present
      if (val && val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    });
  } catch (e) {
    // ignore if .env not found
  }
}
loadEnvFromDotEnv();

const OpenRouterClient = require('../../src/clients/OpenRouterClient');

// Gate AI integration tests by RUN_AI_TESTS and presence of API key
const RUN_AI = String(process.env.RUN_AI_TESTS || '').toLowerCase() === 'true';
const HAS_KEY = !!process.env.OPENROUTER_API_KEY;

// Use describe.skip unless explicitly enabled
const maybeDescribe = RUN_AI && HAS_KEY ? describe : describe.skip;

maybeDescribe('AI Integration with OpenRouterClient', () => {
  let client;

  beforeAll(() => {
    client = new OpenRouterClient({
      // Reads OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL from env
      appName: 'ai-translator-service-integration'
    });
  });

  test('translates short English text to Vietnamese', async () => {
    const out = await client.translate({ text: 'Hello world!', sourceLang: 'en', targetLang: 'vi' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    // Should not echo the original unchanged; basic sanity check
    expect(out.toLowerCase()).not.toContain('hello world');
  });

  test('respects target language change to Japanese', async () => {
    const out = await client.translate({ text: 'Software engineering', sourceLang: 'en', targetLang: 'ja' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('handles auto source language detection', async () => {
    const out = await client.translate({ text: 'Xin chào thế giới!', sourceLang: 'auto', targetLang: 'en' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});

// Informative suite when tests are skipped
describe('AI Integration gating', () => {
  test('RUN_AI_TESTS must be true and OPENROUTER_API_KEY present to run AI tests', () => {
    const explain = {
      RUN_AI_TESTS: process.env.RUN_AI_TESTS || '',
      OPENROUTER_API_KEY_SET: !!process.env.OPENROUTER_API_KEY,
      OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || '',
      OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || ''
    };
    expect(typeof explain).toBe('object');
  });
});