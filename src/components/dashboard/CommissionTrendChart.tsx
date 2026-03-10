import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MonthlyTrend } from '../../services/dashboardService';

interface CommissionTrendChartProps {
  data: MonthlyTrend[];
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function CommissionTrendChart({ data }: CommissionTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Commission Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} width={70} />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  name === 'earned' ? 'Earned' : 'Paid',
                ]}
              />
              <Legend
                formatter={(value: string) => (value === 'earned' ? 'Earned' : 'Paid')}
              />
              <Bar dataKey="earned" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="paid" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
