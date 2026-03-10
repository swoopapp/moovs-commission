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
import { Plus, Search, ChevronRight } from 'lucide-react';

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

export function AgencyTable({ rows, onAddAgency }: AgencyTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch = row.agency.name.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || row.agency.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [rows, search, typeFilter]);

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
          <Button size="sm" className="gap-1.5" onClick={onAddAgency}>
            <Plus className="h-4 w-4" />
            Add Agency
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500">
          {rows.length === 0
            ? 'No agencies yet. Add your first agency to get started.'
            : 'No agencies match your search.'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agency</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Status</TableHead>
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
