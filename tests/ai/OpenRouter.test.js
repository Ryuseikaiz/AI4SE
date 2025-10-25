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

// Always run these tests if API key is available
const HAS_KEY = !!process.env.OPENROUTER_API_KEY;

// Use describe.skip only if no API key
const maybeDescribe = HAS_KEY ? describe : describe.skip;

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
  test('Shows API key configuration status', () => {
    const explain = {
      OPENROUTER_API_KEY_SET: !!process.env.OPENROUTER_API_KEY,
      OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || '',
      OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || ''
    };
    expect(typeof explain).toBe('object');
    if (!process.env.OPENROUTER_API_KEY) {
      console.log('⚠️  OPENROUTER_API_KEY not set - AI Integration tests will be skipped');
    }
  });
});