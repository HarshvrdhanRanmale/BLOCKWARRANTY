const heicConvert = require('heic-convert');
const pdfParse = require('pdf-parse');

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB

const SUPPORTED_DOCUMENT_TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'image/gif': ['gif'],
  'image/bmp': ['bmp'],
  'image/tiff': ['tif', 'tiff'],
  'application/pdf': ['pdf'],
};

function normalizeMimeType(candidateType, fileName = '') {
  let type = String(candidateType || '').toLowerCase().trim();
  if (type === 'image/jpg' || type === 'image/pjpeg') type = 'image/jpeg';
  if (type === 'image/x-png') type = 'image/png';
  if (type === 'image/x-ms-bmp') type = 'image/bmp';
  if (!type || type === 'application/octet-stream') {
    const ext = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'heic') return 'image/heic';
    if (ext === 'heif') return 'image/heif';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'bmp') return 'image/bmp';
    if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
    if (ext === 'pdf') return 'application/pdf';
  }
  return type;
}

function documentSignatureMatches(fileType, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  const ascii = buffer.toString('ascii', 0, Math.min(buffer.length, 32));

  if (fileType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (fileType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (fileType === 'image/webp') {
    return buffer.length >= 12 && ascii.slice(0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (fileType === 'image/heic' || fileType === 'image/heif') {
    return ascii.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8, 16));
  }
  if (fileType === 'image/gif') {
    return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
  }
  if (fileType === 'image/bmp') {
    return buffer[0] === 0x42 && buffer[1] === 0x4d; // 'BM'
  }
  if (fileType === 'image/tiff') {
    return (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    );
  }
  if (fileType === 'application/pdf') {
    return ascii.startsWith('%PDF-');
  }
  return false;
}

function detectMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  const ascii = buffer.toString('ascii', 0, Math.min(buffer.length, 32));
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 12 && ascii.slice(0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (ascii.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8, 16))) {
    return 'image/heic';
  }
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) {
    return 'image/gif';
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return 'image/tiff';
  }
  if (ascii.startsWith('%PDF-')) {
    return 'application/pdf';
  }
  return null;
}

function validateDocumentBuffer(fileType, buffer, maxBytes = MAX_DOCUMENT_BYTES) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error('Empty or invalid file data received.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > maxBytes) {
    const error = new Error(`File size exceeds the maximum limit of ${Math.round(maxBytes / (1024 * 1024))} MB.`);
    error.status = 413;
    throw error;
  }
  let normalizedType = normalizeMimeType(fileType);

  // If claimed type signature matches, use it
  if (documentSignatureMatches(normalizedType, buffer)) {
    return normalizedType;
  }

  // Otherwise, auto-detect actual file format from buffer magic bytes (e.g. WebP/PNG saved with .jpg extension)
  const detectedType = detectMimeType(buffer);
  if (detectedType && Object.keys(SUPPORTED_DOCUMENT_TYPES).includes(detectedType)) {
    return detectedType;
  }

  const error = new Error('The file content does not match any supported document type (JPG, PNG, WebP, HEIC, GIF, BMP, TIFF, or PDF).');
  error.status = 400;
  throw error;
}

async function extractTextFromPdf(buffer) {
  if (typeof pdfParse === 'function') {
    const res = await pdfParse(buffer, { max: 5 });
    return { text: String(res.text || '').trim(), numpages: res.numpages || 1 };
  }
  if (pdfParse && typeof pdfParse.PDFParse === 'function') {
    const parser = new pdfParse.PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      return { text: String(res?.text || '').trim(), numpages: res?.total || 1 };
    } finally {
      await parser.destroy?.();
    }
  }
  throw new Error('PDF parsing engine is not available.');
}

/**
 * Prepares an uploaded document for Groq AI extraction.
 * - PDFs: Extracts text via pdf-parse.
 * - HEIC/HEIF: Converts to JPEG using heic-convert.
 * - JPEG/PNG/WebP: Returns base64 payload.
 */
async function prepareDocumentForExtraction(rawBuffer, rawFileType, fileName = '') {
  const normalizedType = validateDocumentBuffer(rawFileType, rawBuffer);

  // 1. PDF processing
  if (normalizedType === 'application/pdf') {
    try {
      const pdfResult = await extractTextFromPdf(rawBuffer);
      const extractedText = String(pdfResult.text || '').trim();
      if (!extractedText || extractedText.length < 15) {
        return {
          mode: 'unsupported_scanned_pdf',
          message: 'This PDF appears to be a scanned image without an embedded text layer. Automatic AI extraction requires readable text or an image (JPG, PNG, WebP, HEIC). You can enter the details manually and save this document.',
          pageCount: pdfResult.numpages || 1,
        };
      }
      return {
        mode: 'text',
        text: extractedText.slice(0, 16000), // Safe token window
        pageCount: pdfResult.numpages || 1,
      };
    } catch (pdfErr) {
      console.error('PDF parsing error:', pdfErr.message);
      const error = new Error('The PDF document could not be read or is corrupted. Please verify the file and retry.');
      error.status = 400;
      throw error;
    }
  }

  // 2. HEIC / HEIF conversion
  if (normalizedType === 'image/heic' || normalizedType === 'image/heif') {
    try {
      const convertedJpeg = await heicConvert({
        buffer: rawBuffer,
        format: 'JPEG',
        quality: 0.92,
      });
      return {
        mode: 'image',
        mimeType: 'image/jpeg',
        base64: Buffer.from(convertedJpeg).toString('base64'),
        originalType: normalizedType,
      };
    } catch (convErr) {
      console.error('HEIC conversion failed:', convErr.message);
      const error = new Error('Could not convert this HEIC/HEIF image for AI extraction. Please convert to JPG/PNG or enter details manually.');
      error.status = 422;
      throw error;
    }
  }

  // 3. Supported standard images (JPEG, PNG, WebP)
  return {
    mode: 'image',
    mimeType: normalizedType,
    base64: rawBuffer.toString('base64'),
  };
}

module.exports = {
  MAX_DOCUMENT_BYTES,
  SUPPORTED_DOCUMENT_TYPES,
  normalizeMimeType,
  documentSignatureMatches,
  validateDocumentBuffer,
  prepareDocumentForExtraction,
};
