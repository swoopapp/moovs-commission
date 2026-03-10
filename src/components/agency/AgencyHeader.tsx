import { Agency } from '../../types/commission';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  User,
  DollarSign,
  Calendar,
  BookOpen,
  TrendingUp,
  Clock,
  Plus,
} from 'lucide-react';

interface AgencyHeaderProps {
  agency: Agency;
  stats: {
    bookings: number;
    revenue: number;
    commissionEarned: number;
    outstanding: number;
  };
  onCreatePayout?: () => void;
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  Hotel: 'bg-blue-100 text-blue-800',
  DMC: 'bg-purple-100 text-purple-800',
  'Travel Agent': 'bg-green-100 text-green-800',
  OTA: 'bg-orange-100 text-orange-800',
  Concierge: 'bg-teal-100 text-teal-800',
  Other: 'bg-gray-100 text-gray-800',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  archived: 'bg-gray-100 text-gray-600',
};

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCommission(agency: Agency): string {
  if (agency.commission_type === 'flat') {
    return `$${agency.commission_rate} flat per trip`;
  }
  const baseLabel: Record<string, string> = {
    base_rate: 'Base Rate',
    total_amount: 'Total Amount',
    total_with_gratuity: 'Total with Gratuity',
  };
  return `${agency.commission_rate}% of ${baseLabel[agency.commission_base] || 'Total Amount'}`;
}

const miniKPIs = [
  { key: 'bookings', label: 'Bookings', icon: BookOpen, color: 'text-blue-600', bgColor: 'bg-blue-50', format: 'count' as const },
  { key: 'revenue', label: 'Revenue', icon: TrendingUp, color: 'text-green-600', bgColor: 'bg-green-50', format: 'currency' as const },
  { key: 'commissionEarned', label: 'Commission Earned', icon: DollarSign, color: 'text-purple-600', bgColor: 'bg-purple-50', format: 'currency' as const },
  { key: 'outstanding', label: 'Outstanding', icon: Clock, color: 'text-red-600', bgColor: 'bg-red-50', format: 'currency' as const },
] as const;

export function AgencyHeader({ agency, stats, onCreatePayout }: AgencyHeaderProps) {
  const values: Record<string, number> = stats;

  return (
    <div className="space-y-4">
      {/* Back button + title row */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          className="mt-1 shrink-0 gap-1.5"
          onClick={() => { window.location.hash = '#/'; }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to agencies
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{agency.name}</h1>
            <Badge variant="secondary" className={TYPE_BADGE_COLORS[agency.type] || TYPE_BADGE_COLORS.Other}>
              {agency.type}
            </Badge>
            <Badge variant="secondary" className={STATUS_BADGE_COLORS[agency.status] || STATUS_BADGE_COLORS.archived}>
              {agency.status}
            </Badge>
            {onCreatePayout && (
              <Button size="sm" className="gap-1.5 ml-auto" onClick={onCreatePayout}>
                <Plus className="h-4 w-4" />
                Create Payout
              </Button>
            )}
          </div>

          {/* Contact info + commission */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500">
            {agency.contact_name && (
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {agency.contact_name}
              </span>
            )}
            {agency.contact_email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {agency.contact_email}
              </span>
            )}
            {agency.contact_phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {agency.contact_phone}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-500">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {formatCommission(agency)}
            </span>
            {agency.payment_terms && (
              <span className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                {agency.payment_terms}
              </span>
            )}
            {(agency.contract_start || agency.contract_end) && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(agency.contract_start)} - {formatDate(agency.contract_end)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {miniKPIs.map((kpi) => {
          const Icon = kpi.icon;
          const value = values[kpi.key];
          const display = kpi.format === 'currency' ? formatCurrency(value) : value.toString();
          return (
            <Card key={kpi.key} className="py-3">
              <CardContent className="flex items-center gap-3">
                <div className={`${kpi.bgColor} p-2 rounded-lg`}>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
                  <p className="text-lg font-bold text-gray-900">{display}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
