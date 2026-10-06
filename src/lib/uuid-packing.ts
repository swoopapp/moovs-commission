// Compact UUID transport keeps read-only fact bodies below the existing gateway
// inspection limit. This is encoding, not an authorization/capability mechanism.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function packUuidIds(ids: string[]): string {
  if (!ids.length || ids.length > 350 || ids.some((id) => !UUID.test(id)))
    throw new Error('Invalid bounded UUID read');
  let bytes = '';
  for (const id of ids) {
    const hex = id.replace(/-/g, '');
    for (let i = 0; i < hex.length; i += 2)
      bytes += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unpackUuidIds(value: unknown): string[] {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 7500 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new Error('Invalid packed UUID read');
  const bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  if (!bytes.length || bytes.length % 16 !== 0 || bytes.length / 16 > 350)
    throw new Error('Invalid bounded UUID read');
  const ids: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    let hex = '';
    for (let j = i; j < i + 16; j++)
      hex += bytes.charCodeAt(j).toString(16).padStart(2, '0');
    ids.push(
      hex.slice(0, 8) +
        '-' +
        hex.slice(8, 12) +
        '-' +
        hex.slice(12, 16) +
        '-' +
        hex.slice(16, 20) +
        '-' +
        hex.slice(20),
    );
  }
  if (packUuidIds(ids) !== value)
    throw new Error('Noncanonical packed UUID read');
  return ids;
}
