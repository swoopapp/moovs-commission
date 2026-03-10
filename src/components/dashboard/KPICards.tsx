import { Card, CardContent } from '../ui/card';
import { DollarSign, CheckCircle, Building2, Clock } from 'lucide-react';

interface KPICardsProps {
  totalOwed: number;
  paidThisPeriod: number;
  activeAgencies: number;
  pendingPayouts: number;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cards = [
  {
    key: 'totalOwed',
    label: 'Total Commission Owed',
    subtitle: 'Across all agencies',
    icon: DollarSign,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    format: 'currency' as const,
  },
  {
    key: 'paidThisPeriod',
    label: 'Paid This Period',
    subtitle: 'This month',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    format: 'currency' as const,
  },
  {
    key: 'activeAgencies',
    label: 'Active Agencies',
    subtitle: 'With active agents',
    icon: Building2,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    format: 'count' as const,
  },
  {
    key: 'pendingPayouts',
    label: 'Pending Payouts',
    subtitle: 'Awaiting payment',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    format: 'count' as const,
  },
] as const;

export function KPICards({ totalOwed, paidThisPeriod, activeAgencies, pendingPayouts }: KPICardsProps) {
  const values: Record<string, number> = { totalOwed, paidThisPeriod, activeAgencies, pendingPayouts };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = values[card.key];
        const display = card.format === 'currency' ? formatCurrency(value) : value.toString();

        return (
          <Card key={card.key} className="py-4">
            <CardContent className="flex items-center gap-4">
              <div className={`${card.bgColor} p-2.5 rounded-lg`}>
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{display}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
