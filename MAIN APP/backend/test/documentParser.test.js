const {
  validateDocumentBuffer,
  documentSignatureMatches,
  prepareDocumentForExtraction,
  MAX_DOCUMENT_BYTES,
} = require('../src/services/documentParser');

describe('documentParser service tests', () => {
  const validPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
  const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

  describe('signature and validation', () => {
    test('validates and accepts standard PNG, JPG, and PDF buffers', () => {
      expect(documentSignatureMatches('image/png', validPng)).toBe(true);
      expect(documentSignatureMatches('image/jpeg', validJpg)).toBe(true);
      expect(documentSignatureMatches('application/pdf', validPdf)).toBe(true);

      expect(validateDocumentBuffer('image/png', validPng)).toBe('image/png');
      expect(validateDocumentBuffer('image/jpeg', validJpg)).toBe('image/jpeg');
      expect(validateDocumentBuffer('application/pdf', validPdf)).toBe('application/pdf');
    });

    test('rejects mismatched file signatures (MIME spoofing prevention)', () => {
      const spoofedPdf = Buffer.from('NOT A PDF BUT CLAIMS TO BE ONE');
      expect(documentSignatureMatches('application/pdf', spoofedPdf)).toBe(false);
      expect(() => validateDocumentBuffer('application/pdf', spoofedPdf)).toThrow(/claim/i);
    });

    test('rejects oversized files exceeding 15 MB limit', () => {
      const hugeBuffer = Buffer.alloc(100);
      expect(() => validateDocumentBuffer('image/png', hugeBuffer, 50)).toThrow(/exceeds/i);
    });

    test('rejects unsupported file formats', () => {
      expect(() => validateDocumentBuffer('application/x-msdownload', Buffer.from('MZ\x90\x00'))).toThrow(/unsupported/i);
    });
  });

  const fs = require('fs');
  const path = require('path');
  const validPdfFile = fs.readFileSync(path.join(__dirname, '../node_modules/pdf-parse/test/data/01-valid.pdf'));

  describe('prepareDocumentForExtraction', () => {
    test('prepares PNG image as base64 payload', async () => {
      const prepared = await prepareDocumentForExtraction(validPng, 'image/png', 'receipt.png');
      expect(prepared.mode).toBe('image');
      expect(prepared.mimeType).toBe('image/png');
      expect(prepared.base64).toBe(validPng.toString('base64'));
    });

    test('extracts text from valid text-based PDF', async () => {
      const prepared = await prepareDocumentForExtraction(validPdfFile, 'application/pdf', 'invoice.pdf');
      expect(prepared.mode).toBe('text');
      expect(prepared.text.length).toBeGreaterThan(15);
    });

    test('identifies empty or corrupted PDF gracefully', async () => {
      await expect(prepareDocumentForExtraction(validPdf, 'application/pdf', 'corrupt.pdf')).rejects.toThrow(/corrupted/i);
    });
  });
});
