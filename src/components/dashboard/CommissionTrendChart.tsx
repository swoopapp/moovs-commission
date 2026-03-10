import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AgencyMonthlyTrend } from '../../services/dashboardService';

const AGENCY_COLORS = ['#195FE9', '#0C893F', '#7B61FF', '#E67E22', '#D63F49'];

interface CommissionTrendChartProps {
  data: AgencyMonthlyTrend[];
  agencyNames: string[];
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function CommissionTrendChart({ data, agencyNames }: CommissionTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Commission Trend — Top 5 Agencies</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} width={70} />
              <Tooltip
                formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
              />
              <Legend />
              {agencyNames.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId="a"
                  fill={AGENCY_COLORS[i % AGENCY_COLORS.length]}
                  radius={i === agencyNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
