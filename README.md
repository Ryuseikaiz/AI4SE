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
└── README.md                       

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

Used Prompts:

https://tamttt14.github.io/AI4SEProject/index.html Based on the instructions on this page, please provide me with specific checklists.

Currently, I want to develop AI File Translator, list neccesary use cases

Based on those use cases, list the require nodejs package

Build the project

Check the error log, and analyze it

Create Unit Test package for this nodejs project (use jtest)

Analyze this FileTranslatorClass and identify all functions that need unit testing

Check get the api key from .env file

Generate the unit test code 

Describe purpose of those tests

Create unit test for translate the real file, the A_Brief_Introduction_To_AI file

Translate the provided pdf to Vietnamese and log to terminal