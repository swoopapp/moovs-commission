import type { Payout } from '../types/commission';
export function statementText(p: Payout): string[] {
  const s = p.statement_snapshot;
  if (!s)
    throw new Error(
      'No finalized statement snapshot. Legacy payout summary is not a detailed statement.',
    );
  return [
    'Moovs - Commission settlement statement',
    s.agency_name,
    `Statement ${p.id}`,
    `Travel period: ${s.period_start} to ${s.period_end}`,
    `Status: ${p.status} | External payment: ${p.date_paid ?? 'Not recorded'}`,
    'This statement does not initiate a bank transfer.',
    '',
    ...s.lines.flatMap((l) => [
      `Booking ${l.order_number ?? l.moovs_trip_id} | ${l.travel_day ?? l.pickup_date?.slice(0, 10) ?? 'Unknown date'}`,
      `Booking Contact: ${l.booking_contact_name ?? 'Agency-level'} | Passenger: ${l.passenger_name ?? 'Not listed'}`,
      `Base ${Number(l.base_amount).toFixed(2)} | Rate ${l.commission_rate}${l.commission_type === 'percent' ? '%' : ' flat'} | Commission ${Number(l.commission_amount).toFixed(2)}`,
      `Rule: ${l.rule_source} | Base: ${l.commission_base}`,
      '',
    ]),
    ...(s.adjustment_lines ?? []).flatMap((l) => [
      `Correction ${l.id} | Original statement ${l.source_payout_id}`,
      `Commission adjustment ${Number(l.amount).toFixed(2)} | Booking ${l.moovs_trip_id ?? 'Agency-level'}`,
      `Reason: ${l.reason ?? 'Commission correction'}`,
      '',
    ]),
    `Adjustments: ${Number(s.adjustments).toFixed(2)}`,
    `Adjustment reason: ${s.adjustment_reason ?? 'None'}`,
    `Total commission settlement (USD): ${Number(s.total).toFixed(2)}`,
    `External method/reference: ${p.method} / ${p.reference_number ?? 'Not recorded'}`,
  ];
}
const csvCell = (value: unknown) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
export function statementCsv(p: Payout): string {
  if (!p.statement_snapshot) throw new Error('Statement snapshot unavailable.');
  const s = p.statement_snapshot;
  const rows: unknown[][] = [
    [
      'Statement',
      p.id,
      'Agency',
      s.agency_name,
      'Period',
      s.period_start,
      s.period_end,
      'Status',
      p.status,
    ],
    [
      'Booking',
      'Date',
      'Passenger',
      'Booking contact',
      'Base',
      'Rate',
      'Type',
      'Commission',
      'Rule',
    ],
    ...s.lines.map((l) => [
      l.order_number,
      l.travel_day ?? l.pickup_date?.slice(0, 10),
      l.passenger_name,
      l.booking_contact_name,
      l.base_amount,
      l.commission_rate,
      l.commission_type,
      l.commission_amount,
      l.rule_source,
    ]),
    ...(s.adjustment_lines ?? []).map((l) => [
      'Commission correction',
      l.id,
      'Original statement',
      l.source_payout_id,
      l.moovs_trip_id,
      l.amount,
      l.reason,
    ]),
    ['Adjustments', s.adjustments, s.adjustment_reason],
    ['Total USD', s.total],
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function statementPdf(p: Payout): Uint8Array {
  // Standard Helvetica is ASCII here; normalize unsupported glyphs deterministically.
  const lines = statementText(p).flatMap((line) => {
    const s = line.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?');
    return s.match(/.{1,90}/g) ?? [''];
  });
  // Keep a booking's calculation together rather than orphaning its heading.
  const groups: string[][] = [];
  let group: string[] = [];
  for (const line of lines) {
    group.push(line);
    if (line === '') {
      groups.push(group);
      group = [];
    }
  }
  if (group.length) groups.push(group);
  const chunks: string[][] = [];
  let chunk: string[] = [];
  for (const block of groups) {
    if (chunk.length && chunk.length + block.length > 48) {
      chunks.push(chunk);
      chunk = [];
    }
    for (const line of block) {
      if (chunk.length === 48) {
        chunks.push(chunk);
        chunk = [];
      }
      chunk.push(line);
    }
  }
  if (chunk.length) chunks.push(chunk);
  const objects: string[] = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const kids: number[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const page = objects.length,
      stream = page + 1;
    kids.push(page);
    const content =
      'BT /F1 10 Tf 14 TL 40 790 Td ' +
      chunk
        .map((l) => '(' + l.replace(/[\\()]/g, '\\$&') + ') Tj T*')
        .join('\n') +
      ` (${index + 1}/${chunks.length}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  objects[2] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((i) => `${i} 0 R`).join(' ')}] >>`;
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(out.length);
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out +=
    `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
export function downloadStatement(p: Payout, format: 'pdf' | 'csv') {
  const content = format === 'pdf' ? statementPdf(p) : statementCsv(p);
  const blob = new Blob([content as BlobPart], {
    type: format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commission-statement-${p.id}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
