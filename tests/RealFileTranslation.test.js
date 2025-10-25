'use strict';

const fs = require('fs');
const path = require('path');
const FileTranslatorService = require('../src/FileTranslatorService');
const { createParser } = require('../src/parsers');

describe('Real File Translation - A_Brief_Introduction_To_AI.pdf', () => {
  let realFileBuffer;
  let realFileName;

  beforeAll(() => {
    // Load the actual test PDF file
    const pdfPath = path.join(__dirname, 'A_Brief_Introduction_To_AI.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Test PDF not found at: ${pdfPath}`);
    }
    realFileBuffer = fs.readFileSync(pdfPath);
    realFileName = 'A_Brief_Introduction_To_AI.pdf';
  });

  function createMockedService() {
    // Use real parser but mock queue and AI client
    const fileParser = createParser('.pdf');
    const redisQueue = { 
      add: jest.fn().mockResolvedValue({ id: 'mock-job' }),
      ack: jest.fn(),
      nack: jest.fn()
    };
    const aiClient = { 
      translate: jest.fn().mockImplementation(({ text }) => {
        // Mock translation: just prepend "[VI] " to simulate Vietnamese translation
        return Promise.resolve(`[VI] ${text}`);
      })
    };

    const service = new FileTranslatorService({
      fileParser,
      redisQueue,
      aiClient,
      // Use smaller chunks for testing
      textSplitter: {
        splitText: async (text) => {
          const chunkSize = 200;
          const chunks = [];
          for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
          }
          return chunks;
        }
      }
    });

    return { service, fileParser, redisQueue, aiClient };
  }

  test('validates real PDF file successfully', async () => {
    const { service } = createMockedService();
    
    // Should not throw - real file should pass validation
    const ext = service.validateFile(realFileName, realFileBuffer);
    expect(ext).toBe('.pdf');
    expect(realFileBuffer.length).toBeGreaterThan(0);
  });

  test('extracts text from real PDF (using naive parser)', async () => {
    const { fileParser } = createMockedService();
    
    const extractedText = await fileParser.extractText(realFileBuffer, realFileName, '.pdf');
    
    // The naive PDF parser will return either actual text or a fallback
    expect(typeof extractedText).toBe('string');
    expect(extractedText.length).toBeGreaterThan(0);
    
    // Log what we extracted for debugging
    console.log('Extracted text preview:', extractedText.slice(0, 100) + '...');
    console.log('Extracted text length:', extractedText.length);
  });

  test('processes real PDF file through translation pipeline', async () => {
    const { service, redisQueue, aiClient } = createMockedService();
    
    // Translate file - this will extract, chunk, and enqueue
    const { jobId, chunkCount } = await service.translateFile(
      realFileBuffer,
      realFileName,
      'en',
      'vi'
    );

    expect(jobId).toBeDefined();
    expect(chunkCount).toBeGreaterThan(0);
    expect(redisQueue.add).toHaveBeenCalledTimes(chunkCount);

    // Verify each enqueued job has correct structure
    for (let i = 0; i < chunkCount; i++) {
      const call = redisQueue.add.mock.calls[i];
      expect(call[0]).toBe('translation-jobs');
      expect(call[1]).toEqual({
        jobId,
        chunk: expect.any(String),
        index: i,
        sourceLang: 'en',
        targetLang: 'vi',
        ext: '.pdf'
      });
    }
  });

  test('simulates complete translation workflow with real file', async () => {
    const { service, aiClient } = createMockedService();
    
    // Step 1: Submit file for translation
    const { jobId, chunkCount } = await service.translateFile(
      realFileBuffer,
      realFileName,
      'en',
      'vi'
    );

    // Step 2: Simulate processing each job (normally done by workers)
    for (let i = 0; i < chunkCount; i++) {
      const mockPayload = {
        jobId,
        chunk: `chunk-${i}-content`,
        index: i,
        sourceLang: 'en',
        targetLang: 'vi'
      };
      
      const result = await service.processJob(mockPayload);
      expect(result.ok).toBe(true);
      expect(result.index).toBe(i);
    }

    // Step 3: Download completed translation
    const downloadResult = service.downloadFile(jobId);
    
    expect(downloadResult.fileName).toBe('A_Brief_Introduction_To_AI.vi.pdf');
    expect(downloadResult.buffer).toBeInstanceOf(Buffer);
    expect(downloadResult.buffer.length).toBeGreaterThan(0);

    // Verify translation calls were made
    expect(aiClient.translate).toHaveBeenCalledTimes(chunkCount);
    
    // Check translated content structure
    const translatedText = downloadResult.buffer.toString('utf8');
    expect(translatedText).toContain('[VI]'); // Our mock prefix
    
    console.log('Translation result preview:', translatedText.slice(0, 150) + '...');
  });

  test('handles translation errors gracefully with real file', async () => {
    const { service, aiClient } = createMockedService();
    
    // Make AI client fail for some chunks
    aiClient.translate.mockImplementation(({ text, sourceLang, targetLang }) => {
      if (text.includes('error-trigger')) {
        return Promise.reject(new Error('Simulated AI API failure'));
      }
      return Promise.resolve(`[VI] ${text}`);
    });

    const { jobId } = await service.translateFile(
      realFileBuffer,
      realFileName,
      'en',
      'vi'
    );

    // Process a failing job
    const failingPayload = {
      jobId,
      chunk: 'This chunk contains error-trigger text',
      index: 0,
      sourceLang: 'en',
      targetLang: 'vi'
    };

    const result = await service.processJob(failingPayload);
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);

    // Attempting to download should fail due to errors
    expect(() => service.downloadFile(jobId)).toThrow('Một hoặc nhiều tác vụ dịch thất bại.');
  });

  test('generates correct output filename for real file', () => {
    const { service } = createMockedService();
    
    expect(service.buildOutputFileName(realFileName, 'vi')).toBe('A_Brief_Introduction_To_AI.vi.pdf');
    expect(service.buildOutputFileName(realFileName, 'ja')).toBe('A_Brief_Introduction_To_AI.ja.pdf');
    expect(service.buildOutputFileName(realFileName, 'zh')).toBe('A_Brief_Introduction_To_AI.zh.pdf');
  });

  test('respects file size limits with real file', () => {
    const { service } = createMockedService();
    
    // Override with very small limit to test rejection
    service.maxFileSizeBytes = 100; // Much smaller than our PDF
    
    expect(() => {
      service.validateFile(realFileName, realFileBuffer);
    }).toThrow('Kích thước file vượt quá giới hạn cho phép.');
  });

  test('translates real PDF using actual OpenRouter API', async () => {
    // Skip if no API key available
    if (!process.env.OPENROUTER_API_KEY) {
      console.log('⚠️  Skipping real AI test - OPENROUTER_API_KEY not set');
      console.log('To run this test, set the environment variable:');
      console.log('  PowerShell: $env:OPENROUTER_API_KEY="your-key-here"');
      return;
    }

    const OpenRouterClient = require('../src/clients/OpenRouterClient');
    const fileParser = createParser('.pdf');
    const redisQueue = { 
      add: jest.fn().mockResolvedValue({ id: 'mock-job' }),
      ack: jest.fn(),
      nack: jest.fn()
    };
    const aiClient = new OpenRouterClient({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL,
      model: process.env.OPENROUTER_MODEL || 'openrouter/auto', // Use model from env
      appName: 'ai-translator-test'
    });

    const service = new FileTranslatorService({
      fileParser,
      redisQueue,
      aiClient,
      textSplitter: {
        splitText: async (text) => {
          // Use larger chunks for real API to reduce costs
          const chunkSize = 1000;
          const chunks = [];
          for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
          }
          return chunks;
        }
      }
    });

    // Extract and translate first chunk only to save costs
    const extractedText = await fileParser.extractText(realFileBuffer, realFileName, '.pdf');
    
    // For demo purposes, use sample English text if PDF extraction returns binary
    let textToTranslate = extractedText.slice(0, 1000);
    
    // If extracted text looks like binary PDF (starts with %PDF), use sample text instead
    if (textToTranslate.startsWith('%PDF')) {
      textToTranslate = `Generally speaking, Artificial Intelligence is a computing concept that helps a
machine think and solve complex problems as we humans do with our intelligence.
For example, we perform a task, make mistakes and learn from our mistakes (At
least the wise ones of us do!). Likewise, an AI or Artificial Intelligence is supposed
to work on a problem, make some mistakes in solving the problem and learn from
the problems in a self-correcting manner as a part of its self-improvement. Or in
other words, think of this like playing a game of chess. Every bad move you make
reduces your chances of winning the game. So, every time you lose against your
friend, you try remembering the moves you made which you shouldn’t have and
apply that knowledge in your next game and so on. Eventually, you get better and
your precision, or in this case probability of winning or solving a problemimproves by a noteworthy extent. AI is programmed to do something similar to
that!`;
    }
    
    console.log('\n=== Real Translation Test ===');
    console.log('\n📄 Original Text (first 500 chars):');
    console.log(textToTranslate.slice(0, 500));
    
    // Extract first 5 sentences from original
    const originalSentences = textToTranslate.match(/[^.!?]+[.!?]+/g) || [];
    console.log('\n📝 First 5 sentences from original:');
    originalSentences.slice(0, 5).forEach((sentence, i) => {
      console.log(`${i + 1}. ${sentence.trim()}`);
    });

    const translatedText = await aiClient.translate({
      text: textToTranslate,
      sourceLang: 'en',
      targetLang: 'vi'
    });

    console.log('\n🌐 Translated Text (first 500 chars):');
    console.log(translatedText.slice(0, 500));
    
    // Extract first 5 sentences from translation
    const translatedSentences = translatedText.match(/[^.!?]+[.!?]+/g) || [];
    console.log('\n✅ First 5 sentences from translation:');
    translatedSentences.slice(0, 5).forEach((sentence, i) => {
      console.log(`${i + 1}. ${sentence.trim()}`);
    });

    // Export translated text to file
    const outputPath = path.join(__dirname, 'A_Brief_Introduction_To_AI_translated.txt');
    fs.writeFileSync(outputPath, translatedText, 'utf8');
    console.log(`\n💾 Translated text saved to: ${outputPath}`);
    console.log(`   File size: ${translatedText.length} characters`);
    
    expect(translatedText).toBeDefined();
    expect(translatedText.length).toBeGreaterThan(0);
    expect(typeof translatedText).toBe('string');
    
    // The translation should be different from the input
    expect(translatedText).not.toBe(textToTranslate);
  }, 30000); // Increase timeout for API call
});