import { useMemo } from 'react';
import { Reservation, ReservationAttribution, Agent } from '../../types/commission';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../ui/table';
import { Badge } from '../ui/badge';

interface PortalReservationsProps {
  reservations: Reservation[];
  attributions: ReservationAttribution[];
  agents: Agent[];
  view: 'gm' | 'agent';
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TRIP_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  confirmed: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
};

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-gray-100 text-gray-600';
  return TRIP_STATUS_COLORS[status.toLowerCase()] || 'bg-gray-100 text-gray-600';
}

interface JoinedRow {
  reservation: Reservation;
  attribution: ReservationAttribution;
  agentName: string | null;
}

export function PortalReservations({ reservations, attributions, agents, view }: PortalReservationsProps) {
  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    agents.forEach((a) => m.set(a.id, a));
    return m;
  }, [agents]);

  const reservationMap = useMemo(() => {
    const m = new Map<string, Reservation>();
    reservations.forEach((r) => m.set(r.id, r));
    return m;
  }, [reservations]);

  const rows: JoinedRow[] = useMemo(() => {
    return attributions
      .map((attr) => {
        const reservation = reservationMap.get(attr.reservation_id);
        if (!reservation) return null;
        const agent = attr.agent_id ? agentMap.get(attr.agent_id) : null;
        return { reservation, attribution: attr, agentName: agent?.name ?? null };
      })
      .filter((x): x is JoinedRow => x !== null);
  }, [attributions, reservationMap, agentMap]);

  function formatRoute(r: Reservation): string {
    const from = r.pickup_location || '';
    const to = r.dropoff_location || '';
    if (!from && !to) return '--';
    if (!from) return to;
    if (!to) return from;
    const short = (s: string) => (s.length > 25 ? s.slice(0, 22) + '...' : s);
    return `${short(from)} \u2192 ${short(to)}`;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">Reservations</h2>
      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
          No reservations found.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Passenger</TableHead>
                {view === 'gm' && <TableHead>Agent</TableHead>}
                <TableHead>Trip Type</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.attribution.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.reservation.pickup_date)}</TableCell>
                  <TableCell>{row.reservation.passenger_name || '--'}</TableCell>
                  {view === 'gm' && <TableCell>{row.agentName || '--'}</TableCell>}
                  <TableCell>{row.reservation.trip_type || '--'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{formatRoute(row.reservation)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.reservation.total_amount)}</TableCell>
                  <TableCell className="text-right text-green-600 font-semibold">{formatCurrency(row.attribution.commission_amount)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusBadgeClass(row.reservation.trip_status)}>
                      {row.reservation.trip_status || 'Unknown'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
