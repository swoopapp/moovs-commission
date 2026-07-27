/**
 * Split values by their encoded query-string size, not just item count.
 * CloudFront/WAF size restrictions apply before requests reach Next.js.
 */
export function batchEncodedQueryValues(
  values: string[],
  maxEncodedValueLength = 900,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const value of values) {
    const encodedLength = encodeURIComponent(value).length;
    const nextLength = currentLength + encodedLength + (current.length ? 1 : 0);
    if (current.length && nextLength > maxEncodedValueLength) {
      batches.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(value);
    currentLength += encodedLength + (current.length > 1 ? 1 : 0);
  }

  if (current.length) batches.push(current);
  return batches;
}
