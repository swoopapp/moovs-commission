import pg from 'pg';

/** Pool-local parsers. DATE and naive timestamps are strings, never runtime-local Date objects.
 * timestamptz keeps pg's instant parser. Do not mutate pg's global parsers or session timezone.
 */
export const calendarPgTypes = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (format !== 'binary' && (oid === 1082 || oid === 1114))
      return (value: string) => value;
    return pg.types.getTypeParser(oid, format as 'text');
  },
};
