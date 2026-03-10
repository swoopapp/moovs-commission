import type { Agency, Payout, Reservation, ReservationAttribution } from '../types/commission';

/**
 * Generic CSV download utility. Escapes cell values with double-quote wrapping.
 */
export function downloadCSV(filename: string, headers: string[], rows: string[][]): void {
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US');
}

/**
 * Export payout details as CSV (all reservations included in a payout).
 */
export function exportPayoutCSV(
  payout: Payout,
  reservations: Reservation[],
  attributions: ReservationAttribution[],
): void {
  const headers = [
    'Order #',
    'Confirmation #',
    'Pickup Date',
    'Passenger',
    'Pickup',
    'Dropoff',
    'Vehicle',
    'Trip Total',
    'Commission',
  ];

  const rows = attributions.map(attr => {
    const res = reservations.find(r => r.id === attr.reservation_id);
    return [
      res?.order_number ?? '',
      res?.confirmation_number ?? '',
      formatDate(res?.pickup_date ?? null),
      res?.passenger_name ?? '',
      res?.pickup_location ?? '',
      res?.dropoff_location ?? '',
      res?.vehicle_type ?? '',
      formatCurrency(res?.total_amount ?? 0),
      formatCurrency(attr.commission_amount),
    ];
  });

  const periodStart = formatDate(payout.period_start);
  const periodEnd = formatDate(payout.period_end);
  const filename = `payout_${periodStart}_${periodEnd}.csv`.replace(/\//g, '-');

  downloadCSV(filename, headers, rows);
}

/**
 * Export a full commission statement for an agency.
 */
export function exportCommissionStatement(
  agency: Agency,
  reservations: Reservation[],
  attributions: ReservationAttribution[],
): void {
  const headers = [
    'Order #',
    'Confirmation #',
    'Pickup Date',
    'Passenger',
    'Pickup',
    'Dropoff',
    'Vehicle',
    'Trip Type',
    'Base Rate',
    'Total Amount',
    'Commission Rate',
    'Commission Type',
    'Commission Amount',
    'Attributed At',
  ];

  const rows = attributions.map(attr => {
    const res = reservations.find(r => r.id === attr.reservation_id);
    const rateDisplay =
      attr.commission_type === 'flat'
        ? `$${attr.commission_rate}`
        : `${attr.commission_rate}%`;

    return [
      res?.order_number ?? '',
      res?.confirmation_number ?? '',
      formatDate(res?.pickup_date ?? null),
      res?.passenger_name ?? '',
      res?.pickup_location ?? '',
      res?.dropoff_location ?? '',
      res?.vehicle_type ?? '',
      res?.trip_type ?? '',
      formatCurrency(res?.base_rate_amount ?? 0),
      formatCurrency(res?.total_amount ?? 0),
      rateDisplay,
      attr.commission_type,
      formatCurrency(attr.commission_amount),
      formatDate(attr.attributed_at),
    ];
  });

  const safeName = agency.name.replace(/[^a-zA-Z0-9]/g, '_');
  const today = new Date().toISOString().split('T')[0];
  const filename = `commission_statement_${safeName}_${today}.csv`;

  downloadCSV(filename, headers, rows);
}
