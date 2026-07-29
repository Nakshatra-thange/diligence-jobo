import crypto from 'node:crypto';


export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf-8');
  const givenBuf = Buffer.from(signatureHeader, 'utf-8');

  if (expectedBuf.length !== givenBuf.length) return false;

  // timingSafeEqual prevents an attacker from guessing the signature
  // byte-by-byte via response-time differences.
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}