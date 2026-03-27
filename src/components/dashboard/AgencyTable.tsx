import { useState, useEffect } from 'react';
import { Agency, AgencyType, AgencyStatus } from '../../types/commission';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Plus, Search, ChevronRight, Link2, ChevronLeft, Link, Unlink } from 'lucide-react';

interface AgencyTableProps {
  agencies: Agency[];
  totalAgencies: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSearchChange: (search: string) => void;
  onAddAgency?: () => void;
  onRefresh?: () => void;
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

function formatRate(agency: Agency): string {
  if (agency.commission_type === 'flat') {
    return `$${agency.commission_rate}`;
  }
  return `${agency.commission_rate}%`;
}

export function AgencyTable({
  agencies,
  totalAgencies,
  page,
  pageSize,
  loading,
  onPageChange,
  onPageSizeChange,
  onSearchChange,
  onAddAgency,
}: AgencyTableProps) {
  const [searchInput, setSearchInput] = useState('');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onSearchChange]);

  const totalPages = Math.ceil(totalAgencies / pageSize);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header controls */}
      <div className="px-4 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search agencies..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
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

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
        </div>
      ) : agencies.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500">
          {totalAgencies === 0
            ? 'No agencies yet. Add your first agency to get started.'
            : 'No agencies match your search.'}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Agency</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agencies.map((agency) => (
              <TableRow
                key={agency.id}
                className="cursor-pointer"
                onClick={() => {
                  window.location.hash = `#/agency/${agency.id}`;
                }}
              >
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          {agency.moovs_company_id ? (
                            <Link className="h-4 w-4 text-green-500" />
                          ) : (
                            <Unlink className="h-4 w-4 text-gray-300" />
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {agency.moovs_company_id ? 'Linked to Moovs company' : 'Not linked — trips won\'t auto-match'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="font-medium">{agency.name}</TableCell>
                <TableCell className="text-sm text-gray-500">
                  {agency.contact_name || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={TYPE_BADGE_COLORS[agency.type]}
                  >
                    {agency.type}
                  </Badge>
                </TableCell>
                <TableCell>{formatRate(agency)}</TableCell>
                <TableCell className="text-sm text-gray-500">
                  {[agency.city, agency.state].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STATUS_BADGE_COLORS[agency.status]}
                  >
                    {agency.status}
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

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Show</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(v === 'all' ? 9999 : parseInt(v))}>
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <span>of {totalAgencies} agencies</span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
