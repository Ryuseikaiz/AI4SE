'use strict';

/**
 * Parsers for different document types and a simple factory.
 * These are lightweight placeholders to avoid heavy binary dependencies in unit tests.
 * Replace implementations with real libraries in production:
 *  - PDF: pdf-parse or pdfjs
 *  - DOCX: mammoth
 *  - XLSX: xlsx
 *  - PPTX: pptx-parser or officeparser
 */

class BaseParser {
  async extractText(buffer, fileName, ext) {
    throw new Error('Not implemented');
  }
}

class TextParser extends BaseParser {
  async extractText(buffer) {
    return buffer.toString('utf8');
  }
}

class PdfParser extends BaseParser {
  async extractText(buffer, fileName) {
    try {
      // Try to use pdf-parse if available
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text || `PDF(${fileName})`;
    } catch (err) {
      // Fallback if pdf-parse is not installed or fails
      console.warn('pdf-parse not available or failed, using naive fallback:', err.message);
      const text = buffer.toString('utf8');
      if (!text || !text.trim()) {
        return `PDF(${fileName})`;
      }
      return text;
    }
  }
}

class DocxParser extends BaseParser {
  async extractText(buffer, fileName) {
    const text = buffer.toString('utf8');
    return text && text.trim() ? text : `DOCX(${fileName})`;
  }
}

class XlsxParser extends BaseParser {
  async extractText(buffer, fileName) {
    // Real parsing should iterate sheets and cells
    const text = buffer.toString('utf8');
    return text && text.trim() ? text : `XLSX(${fileName})`;
  }
}

class PptxParser extends BaseParser {
  async extractText(buffer, fileName) {
    // Real parsing should iterate slides and text boxes
    const text = buffer.toString('utf8');
    return text && text.trim() ? text : `PPTX(${fileName})`;
  }
}

/**
 * Simple parser factory by extension.
 * @param {string} ext - lowercase extension including dot, e.g., ".pdf"
 * @returns {BaseParser}
 */
function createParser(ext) {
  switch (ext) {
    case '.txt':
      return new TextParser();
    case '.pdf':
      return new PdfParser();
    case '.docx':
      return new DocxParser();
    case '.xlsx':
      return new XlsxParser();
    case '.pptx':
      return new PptxParser();
    default:
      throw new Error('Không có parser phù hợp cho định dạng file.');
  }
}

module.exports = {
  BaseParser,
  TextParser,
  PdfParser,
  DocxParser,
  XlsxParser,
  PptxParser,
  createParser
};