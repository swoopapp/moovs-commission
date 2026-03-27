import { useState, useMemo } from 'react';
import { AgencyTableRow } from '../../services/dashboardService';
import { AgencyType, AgencyStatus } from '../../types/commission';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';
import { Plus, Search, ChevronRight, Link2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface AgencyTableProps {
  rows: AgencyTableRow[];
  onAddAgency?: () => void;
}

const TYPE_BADGE_COLORS: Record<AgencyType, string> = {
  Hotel: 'bg-blue-100 text-blue-800',
  DMC: 'bg-purple-100 text-purple-800',
  'Travel Agent': 'bg-green-100 text-green-800',
  OTA: 'bg-orange-100 text-orange-800',
  Concierge: 'bg-teal-100 text-teal-800',
  Other: 'bg-gray-100 text-gray-800',
};

const STATUS_BADGE_COLORS: Record<AgencyStatus, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-600',
};

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRate(row: AgencyTableRow): string {
  const { agency } = row;
  if (agency.commission_type === 'flat') {
    return `$${agency.commission_rate}`;
  }
  return `${agency.commission_rate}%`;
}

type SortField = 'name' | 'type' | 'bookings' | 'revenue' | 'earned' | 'paid' | 'outstanding' | 'status';
type SortDir = 'asc' | 'desc';

function getSortValue(row: AgencyTableRow, field: SortField): string | number {
  switch (field) {
    case 'name': return row.agency.name.toLowerCase();
    case 'type': return row.agency.type;
    case 'bookings': return row.bookings;
    case 'revenue': return row.revenue;
    case 'earned': return row.earned;
    case 'paid': return row.paid;
    case 'outstanding': return row.outstanding;
    case 'status': return row.agency.status;
  }
}

export function AgencyTable({ rows, onAddAgency }: AgencyTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' || field === 'type' || field === 'status' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  }

  const filtered = useMemo(() => {
    let list = rows.filter((row) => {
      const matchesSearch =
        row.agency.name.toLowerCase().includes(search.toLowerCase()) ||
        (row.agency.contact_name && row.agency.contact_name.toLowerCase().includes(search.toLowerCase())) ||
        (row.agency.contact_email && row.agency.contact_email.toLowerCase().includes(search.toLowerCase()));
      const matchesType = typeFilter === 'all' || row.agency.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || row.agency.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });

    list.sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [rows, search, typeFilter, statusFilter, sortField, sortDir]);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header controls */}
      <div className="px-4 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search agencies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Hotel">Hotel</SelectItem>
              <SelectItem value="DMC">DMC</SelectItem>
              <SelectItem value="Travel Agent">Travel Agent</SelectItem>
              <SelectItem value="OTA">OTA</SelectItem>
              <SelectItem value="Concierge">Concierge</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { window.location.hash = '#/matching'; }}>
            <Link2 className="h-4 w-4" />
            Match Agencies
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onAddAgency}>
            <Plus className="h-4 w-4" />
            Add Agency
          </Button>
        </div>
      </div>

      {/* Results count */}
      {(search || typeFilter !== 'all' || statusFilter !== 'all') && (
        <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
          Showing {filtered.length} of {rows.length} agencies
          {search && <> matching "{search}"</>}
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500">
          {rows.length === 0
            ? 'No agencies yet. Add your first agency to get started.'
            : 'No agencies match your filters.'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                <span className="flex items-center">Agency <SortIcon field="name" /></span>
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('type')}>
                <span className="flex items-center">Type <SortIcon field="type" /></span>
              </TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('bookings')}>
                <span className="flex items-center justify-end">Bookings <SortIcon field="bookings" /></span>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('revenue')}>
                <span className="flex items-center justify-end">Revenue <SortIcon field="revenue" /></span>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('earned')}>
                <span className="flex items-center justify-end">Earned <SortIcon field="earned" /></span>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('paid')}>
                <span className="flex items-center justify-end">Paid <SortIcon field="paid" /></span>
              </TableHead>
              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('outstanding')}>
                <span className="flex items-center justify-end">Outstanding <SortIcon field="outstanding" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('status')}>
                <span className="flex items-center">Status <SortIcon field="status" /></span>
              </TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow
                key={row.agency.id}
                className="cursor-pointer"
                onClick={() => {
                  window.location.hash = `#/agency/${row.agency.id}`;
                }}
              >
                <TableCell className="font-medium">{row.agency.name}</TableCell>
                <TableCell className="text-sm text-gray-500">
                  {row.agency.contact_name || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={TYPE_BADGE_COLORS[row.agency.type]}
                  >
                    {row.agency.type}
                  </Badge>
                </TableCell>
                <TableCell>{formatRate(row)}</TableCell>
                <TableCell className="text-right">{row.bookings}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                <TableCell className="text-right text-green-600 font-medium">{formatCurrency(row.earned)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.paid)}</TableCell>
                <TableCell className={`text-right font-semibold ${row.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(row.outstanding)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STATUS_BADGE_COLORS[row.agency.status]}
                  >
                    {row.agency.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
