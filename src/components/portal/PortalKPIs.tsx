import { ReservationAttribution, Reservation } from '../../types/commission';
import { Card, CardContent } from '../ui/card';
import { CalendarCheck, DollarSign, Banknote } from 'lucide-react';

interface PortalKPIsProps {
  reservations: Reservation[];
  attributions: ReservationAttribution[];
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortalKPIs({ reservations, attributions }: PortalKPIsProps) {
  const totalBookings = attributions.length;
  const totalRevenue = reservations.reduce((sum, r) => sum + r.total_amount, 0);
  const totalCommission = attributions.reduce((sum, a) => sum + a.commission_amount, 0);

  const kpis = [
    {
      label: 'Total Bookings',
      value: totalBookings.toString(),
      icon: CalendarCheck,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Revenue Generated',
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Commission Earned',
      value: formatCurrency(totalCommission),
      icon: Banknote,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card key={kpi.label} className="py-4">
            <CardContent className="flex items-center gap-4">
              <div className={`${kpi.bgColor} p-2.5 rounded-lg`}>
                <Icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
