import { useState } from 'react';
import { Agency, CommissionType, CommissionBase } from '../../types/commission';
import { updateAgency, deleteAgency } from '../../services/agencyService';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui/select';
import { Copy, Trash2, Link, Percent, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsTabProps {
  agency: Agency;
  onUpdated: (agency: Agency) => void;
}

export function SettingsTab({ agency, onUpdated }: SettingsTabProps) {
  const [commissionRate, setCommissionRate] = useState(agency.commission_rate.toString());
  const [commissionType, setCommissionType] = useState<CommissionType>(agency.commission_type);
  const [commissionBase, setCommissionBase] = useState<CommissionBase>(agency.commission_base);
  const [paymentTerms, setPaymentTerms] = useState(agency.payment_terms || '');
  const [contractStart, setContractStart] = useState(agency.contract_start || '');
  const [contractEnd, setContractEnd] = useState(agency.contract_end || '');
  const [notes, setNotes] = useState(agency.notes || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const portalUrl = `${window.location.origin}/portal/${agency.portal_token}`;
  const isActive = agency.status === 'active';

  async function handleSave() {
    try {
      setSaving(true);
      const updated = await updateAgency(agency.id, {
        commission_rate: parseFloat(commissionRate) || 0,
        commission_type: commissionType,
        commission_base: commissionBase,
        payment_terms: paymentTerms || null,
        contract_start: contractStart || null,
        contract_end: contractEnd || null,
        notes: notes || null,
      });
      onUpdated(updated);
      toast.success('Agency settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle() {
    try {
      const newStatus = isActive ? 'suspended' : 'active';
      const updated = await updateAgency(agency.id, { status: newStatus as Agency['status'] });
      onUpdated(updated);
      toast.success(`Agency ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch (err) {
      console.error('Failed to toggle status:', err);
      toast.error('Failed to update agency status');
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      setDeleting(true);
      await deleteAgency(agency.id);
      toast.success('Agency deleted');
      window.location.hash = '#/';
    } catch (err) {
      console.error('Failed to delete agency:', err);
      toast.error('Failed to delete agency');
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyPortalLink() {
    navigator.clipboard.writeText(portalUrl);
    toast.success('Portal link copied to clipboard');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Commission & Contract */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commission Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Type toggle */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  variant={commissionType === 'percent' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCommissionType('percent')}
                >
                  <Percent className="h-3.5 w-3.5" />
                  Percentage
                </Button>
                <Button
                  variant={commissionType === 'flat' ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCommissionType('flat')}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Flat Amount
                </Button>
              </div>
            </div>

            {/* Rate input */}
            <div className="space-y-2">
              <Label htmlFor="commission-rate">Rate</Label>
              <div className="relative max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  {commissionType === 'flat' ? '$' : ''}
                </span>
                <Input
                  id="commission-rate"
                  type="number"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className={commissionType === 'flat' ? 'pl-7' : ''}
                />
                {commissionType === 'percent' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                )}
              </div>
            </div>

            {/* Commission base */}
            {commissionType === 'percent' && (
              <div className="space-y-2">
                <Label>Commission Base</Label>
                <Select value={commissionBase} onValueChange={(v) => setCommissionBase(v as CommissionBase)}>
                  <SelectTrigger className="max-w-[250px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base_rate">Base Rate</SelectItem>
                    <SelectItem value="total_amount">Total Amount</SelectItem>
                    <SelectItem value="total_with_gratuity">Total with Gratuity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contract Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms || 'none'} onValueChange={(v) => setPaymentTerms(v === 'none' ? '' : v)}>
                <SelectTrigger className="max-w-[250px]">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="Net 15">Net 15</SelectItem>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                  <SelectItem value="Net 45">Net 45</SelectItem>
                  <SelectItem value="Net 60">Net 60</SelectItem>
                  <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contract-start">Contract Start</Label>
                <Input
                  id="contract-start"
                  type="date"
                  value={contractStart}
                  onChange={(e) => setContractStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract-end">Contract End</Label>
                <Input
                  id="contract-end"
                  type="date"
                  value={contractEnd}
                  onChange={(e) => setContractEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes about this agency (visible only to your team)"
                rows={3}
              />
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Portal, Status, Danger Zone */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link className="h-4 w-4" />
              Agency Portal Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              Share this link with the agency to give them access to their portal.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={portalUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={handleCopyPortalLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agency Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{isActive ? 'Active' : 'Suspended'}</p>
                <p className="text-sm text-gray-500">
                  {isActive
                    ? 'Agency is active and can receive commissions'
                    : 'Agency is suspended and will not receive new commissions'}
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={handleStatusToggle} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              Permanently delete this agency, all agents, and their attribution history. This action cannot be undone.
            </p>
            <Separator />
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : confirmDelete ? 'Click again to confirm' : 'Delete Agency'}
            </Button>
            {confirmDelete && !deleting && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
