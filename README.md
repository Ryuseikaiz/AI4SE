# AI File Translator Service

A Node.js-based translation service that uses AI to translate documents (PDF, DOCX, TXT, etc.) between languages. The service supports chunked translation for large documents and uses Redis for job queuing.

## Features

- 🌐 Multi-language translation using OpenRouter/AgentRouter API
- 📄 Support for multiple file formats (PDF, DOCX, XLSX, PPTX, TXT)
- ⚡ Chunked processing for large documents
- 🔄 Redis-based job queue for scalable processing
- 🧪 Comprehensive test suite with real AI integration tests

## Prerequisites

- Node.js (v14 or higher)
- Redis (optional, for production use)
- OpenRouter/AgentRouter API key

## Installation

1. **Clone the repository**
   git clone https://github.com/Ryuseikaiz/AI4SE.git

2. **Install dependencies**
   npm install

3. **Install PDF parsing library** (for real PDF text extraction)
   npm install pdf-parse

4. **Configure environment variables**
   Create a `.env` file in the root directory:
   OPENROUTER_API_KEY=your-api-key-here
   OPENROUTER_BASE_URL=https://ai.121628.xyz
   OPENROUTER_MODEL=gemini-2.5-flash

### Run all tests
npm test

**File Translator Service tests:**
npm test -- tests/FileTranslatorService.test.js

**Real file translation tests:**
npm test -- tests/RealFileTranslation.test.js

**OpenRouter integration tests:**
npm test -- tests/ai/OpenRouter.test.js

### Run real AI translation test
To run the test that calls real AI and translates actual content:

**PowerShell:**
$env:OPENROUTER_API_KEY='your-api-key-here'
$env:OPENROUTER_BASE_URL='https://ai.121628.xyz'
$env:OPENROUTER_MODEL='gemini-2.5-flash'
npm test -- -t "translates real PDF using actual OpenRouter API"

**Bash/Linux:**
export OPENROUTER_API_KEY='your-api-key-here'
export OPENROUTER_BASE_URL='https://ai.121628.xyz'
export OPENROUTER_MODEL='gemini-2.5-flash'
npm test -- -t "translates real PDF using actual OpenRouter API"

This test will:
- Read the PDF file from `tests/A_Brief_Introduction_To_AI.pdf`
- Extract text content
- Translate from English to Vietnamese using real AI
- Display the first 5 sentences of both original and translated text
- Save the translated text to `tests/A_Brief_Introduction_To_AI_translated.txt`

```
AI4SE/
├── src/
│   ├── FileTranslatorService.js    # Main translation service
│   ├── parsers.js                  # File parsers (PDF, DOCX, etc.)
│   ├── clients/
│   │   └── OpenRouterClient.js     # OpenRouter/AgentRouter API client
│   ├── queue/
│   │   └── RedisQueue.js           # Redis queue implementation
│   └── workers/
│       └── translatorWorker.js     # Background worker for processing
├── tests/
│   ├── FileTranslatorService.test.js       # Service unit tests
│   ├── RealFileTranslation.test.js         # Real file translation tests
│   ├── ai/
│   │   └── OpenRouter.test.js              # AI integration tests
│   └── A_Brief_Introduction_To_AI.pdf      # Test PDF file
├── .env                            # Environment configuration
├── package.json                    # Project dependencies
└── README.md                       # This file
```

## Usage Example

### Basic Translation Service

```javascript
const FileTranslatorService = require('./src/FileTranslatorService');
const OpenRouterClient = require('./src/clients/OpenRouterClient');
const { createParser } = require('./src/parsers');

// Initialize components
const aiClient = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseUrl: process.env.OPENROUTER_BASE_URL,
  model: process.env.OPENROUTER_MODEL
});

const fileParser = createParser('.pdf');
const redisQueue = null; // Use null for testing, provide Redis instance for production

// Create service
const service = new FileTranslatorService({
  fileParser,
  redisQueue,
  aiClient
});

// Translate a file
const fileBuffer = fs.readFileSync('document.pdf');
const result = await service.translateFile(
  fileBuffer,
  'document.pdf',
  'en',  // source language
  'vi'   // target language
);

console.log(`Translation job ${result.jobId} created with ${result.chunkCount} chunks`);
```

### Direct Translation

```javascript
const OpenRouterClient = require('./src/clients/OpenRouterClient');

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseUrl: process.env.OPENROUTER_BASE_URL,
  model: 'gemini-2.5-flash'
});

const translated = await client.translate({
  text: 'Hello, world!',
  sourceLang: 'en',
  targetLang: 'vi'
});

console.log(translated); // "Xin chào, thế giới!"
```

## Configuration

### Supported Languages

Common language codes:
- `en` - English
- `vi` - Vietnamese
- `ja` - Japanese
- `zh` - Chinese
- `fr` - French
- `de` - German
- `es` - Spanish
- `auto` - Auto-detect (source language only)

### Supported File Formats

- `.txt` - Plain text files
- `.pdf` - PDF documents (requires pdf-parse)
- `.docx` - Microsoft Word documents
- `.xlsx` - Microsoft Excel spreadsheets
- `.pptx` - Microsoft PowerPoint presentations

**Note:** For production use with binary formats (PDF, DOCX, etc.), you should install proper parsing libraries like `pdf-parse`, `mammoth`, `xlsx`, etc.

## API Configuration

### OpenRouter

To use OpenRouter (https://openrouter.ai):
```env
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openrouter/auto
```

### AgentRouter (Custom Gateway)

To use a custom AgentRouter gateway:
```env
OPENROUTER_API_KEY=your-custom-key
OPENROUTER_BASE_URL=https://your-gateway.com
OPENROUTER_MODEL=gemini-2.5-flash
```

## Development

### Running in Development Mode

```bash
npm test -- --watch
```

### Code Coverage

```bash
npm test -- --coverage
```

## Troubleshooting

### PDF text extraction returns binary content

If the PDF parser returns binary content (starting with `%PDF`), you need to install the `pdf-parse` library:

```bash
npm install pdf-parse
```

### API authentication errors (401)

Make sure your API key is correctly set in the `.env` file or environment variables:

```bash
# PowerShell
$env:OPENROUTER_API_KEY='your-key-here'

# Bash
export OPENROUTER_API_KEY='your-key-here'
```

### Model not found errors (503)

Ensure the model name matches what's available in your API gateway. For AgentRouter, check that the model is configured in your gateway's model list.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
