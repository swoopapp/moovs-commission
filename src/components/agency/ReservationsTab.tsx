import { useMemo, useState } from 'react';
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
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';

interface ReservationsTabProps {
  reservations: Reservation[];
  attributions: ReservationAttribution[];
  agents: Agent[];
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

interface JoinedReservation {
  reservation: Reservation;
  attribution: ReservationAttribution;
  agentName: string | null;
}

export function ReservationsTab({ reservations, attributions, agents }: ReservationsTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');

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

  const joined: JoinedReservation[] = useMemo(() => {
    return attributions
      .map((attr) => {
        const reservation = reservationMap.get(attr.reservation_id);
        if (!reservation) return null;
        const agent = attr.agent_id ? agentMap.get(attr.agent_id) : null;
        return {
          reservation,
          attribution: attr,
          agentName: agent?.name ?? null,
        };
      })
      .filter((x): x is JoinedReservation => x !== null);
  }, [attributions, reservationMap, agentMap]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    joined.forEach((j) => {
      if (j.reservation.trip_status) s.add(j.reservation.trip_status);
    });
    return Array.from(s).sort();
  }, [joined]);

  const filtered = useMemo(() => {
    return joined.filter((j) => {
      const matchesStatus = statusFilter === 'all' || j.reservation.trip_status?.toLowerCase() === statusFilter.toLowerCase();
      const matchesAgent = agentFilter === 'all' || j.attribution.agent_id === agentFilter;
      return matchesStatus && matchesAgent;
    });
  }, [joined, statusFilter, agentFilter]);

  function formatRoute(r: Reservation): string {
    const from = r.pickup_location || '';
    const to = r.dropoff_location || '';
    if (!from && !to) return '--';
    if (!from) return to;
    if (!to) return from;
    // Truncate long locations
    const short = (s: string) => s.length > 25 ? s.slice(0, 22) + '...' : s;
    return `${short(from)} → ${short(to)}`;
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 font-medium">{filtered.length} reservations</p>
        <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
          No reservations found.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Passenger</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Trip Type</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((j) => (
                <TableRow key={j.attribution.id}>
                  <TableCell className="font-medium text-blue-600">
                    {j.reservation.order_number || j.reservation.confirmation_number || '--'}
                  </TableCell>
                  <TableCell>{formatDate(j.reservation.pickup_date)}</TableCell>
                  <TableCell>{j.reservation.passenger_name || '--'}</TableCell>
                  <TableCell>{j.agentName || '--'}</TableCell>
                  <TableCell>{j.reservation.trip_type || '--'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{formatRoute(j.reservation)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(j.reservation.total_amount)}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{formatCurrency(j.attribution.commission_amount)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusBadgeClass(j.reservation.trip_status)}>
                      {j.reservation.trip_status || 'Unknown'}
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
