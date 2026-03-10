import { useState } from 'react';
import { createAgent, CreateAgentInput } from '../../services/agentService';
import { AgentRole } from '../../types/commission';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';
import { toast } from 'sonner';

interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  onCreated: () => void;
}

export function AddAgentDialog({ open, onOpenChange, agencyId, onCreated }: AddAgentDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AgentRole>('agent');
  const [department, setDepartment] = useState('');
  const [creating, setCreating] = useState(false);

  function resetForm() {
    setName('');
    setEmail('');
    setPhone('');
    setRole('agent');
    setDepartment('');
  }

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      setCreating(true);
      const data: CreateAgentInput = {
        agency_id: agencyId,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
        department: department.trim() || null,
        status: 'active',
      };
      await createAgent(data);
      toast.success(`Agent "${name.trim()}" added`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error('Failed to add agent:', err);
      toast.error('Failed to add agent');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Name *</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-email">Email</Label>
            <Input
              id="agent-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-phone">Phone</Label>
            <Input
              id="agent-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AgentRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="gm">GM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-department">Department</Label>
            <Input
              id="agent-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Front Desk, Sales"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? 'Adding...' : 'Add Agent'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
