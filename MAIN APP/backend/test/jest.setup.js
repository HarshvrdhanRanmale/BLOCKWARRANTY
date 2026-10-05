/**
 * Jest setup for BlockWarranty backend tests.
 *
 * This file runs once in the Node.js environment before any test suite.
 * It ensures that globals like Buffer, process, etc. are properly set up
 * so that the MongoDB Node.js driver v7 can correctly build its client metadata.
 */

// Ensure Buffer is properly available in the test context
// (required for BSON serialization in MongoDB driver v7.x)
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

// Ensure TextEncoder / TextDecoder are available (used by some crypto paths)
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
