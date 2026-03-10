import { useMemo, useState } from 'react';
import { Agency, Agent, ReservationAttribution, Reservation } from '../../types/commission';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Plus, Mail, Phone, BookOpen, TrendingUp, DollarSign } from 'lucide-react';
import { AddAgentDialog } from './AddAgentDialog';

interface AgentsTabProps {
  agents: Agent[];
  attributions: ReservationAttribution[];
  reservations: Reservation[];
  agencyId: string;
  agency: Agency;
  onAgentCreated: () => void;
  onFilterByAgent: (agentId: string) => void;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface AgentStats {
  bookings: number;
  revenue: number;
  commission: number;
}

export function AgentsTab({ agents, attributions, reservations, agencyId, agency, onAgentCreated, onFilterByAgent }: AgentsTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const reservationMap = useMemo(() => {
    const m = new Map<string, Reservation>();
    reservations.forEach((r) => m.set(r.id, r));
    return m;
  }, [reservations]);

  const agentStats = useMemo(() => {
    const stats = new Map<string, AgentStats>();
    agents.forEach((a) => stats.set(a.id, { bookings: 0, revenue: 0, commission: 0 }));

    attributions.forEach((attr) => {
      if (!attr.agent_id) return;
      const s = stats.get(attr.agent_id);
      if (!s) return;
      const res = reservationMap.get(attr.reservation_id);
      s.bookings += 1;
      s.revenue += res?.total_amount ?? 0;
      s.commission += attr.commission_amount;
    });

    return stats;
  }, [agents, attributions, reservationMap]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4" />
          Add Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
          No agents yet. Add your first agent to start tracking individual performance.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const stats = agentStats.get(agent.id) || { bookings: 0, revenue: 0, commission: 0 };
            return (
              <Card
                key={agent.id}
                className="cursor-pointer hover:shadow-md transition-shadow py-4"
                onClick={() => onFilterByAgent(agent.id)}
              >
                <CardContent className="space-y-3">
                  {/* Agent identity */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-gray-100 text-gray-700 text-sm font-medium">
                        {getInitials(agent.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">{agent.name}</p>
                        <Badge variant="secondary" className={agent.role === 'gm' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}>
                          {agent.role === 'gm' ? 'GM' : 'Agent'}
                        </Badge>
                      </div>
                      {agent.department && (
                        <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs font-normal">
                          {agent.department}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="space-y-1 text-sm text-gray-500">
                    {agent.email && (
                      <p className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {agent.email}
                      </p>
                    )}
                    {agent.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {agent.phone}
                      </p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="border-t pt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
                        <BookOpen className="h-3 w-3" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{stats.bookings}</p>
                      <p className="text-xs text-gray-500">Bookings</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
                        <TrendingUp className="h-3 w-3" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(stats.revenue)}</p>
                      <p className="text-xs text-gray-500">Revenue</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
                        <DollarSign className="h-3 w-3" />
                      </div>
                      <p className="text-sm font-semibold text-green-600">{formatCurrency(stats.commission)}</p>
                      <p className="text-xs text-gray-500">Commission</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddAgentDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        agencyId={agencyId}
        agency={agency}
        onCreated={onAgentCreated}
      />
    </div>
  );
}
