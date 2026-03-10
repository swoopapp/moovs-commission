import { useState, useEffect, useRef } from 'react';
import { createAgent, CreateAgentInput } from '../../services/agentService';
import { Agency, AgentRole } from '../../types/commission';
import { fetchMoovsContacts, MoovsContact } from '../../services/contactLookupService';
import { useOperator } from '../../contexts/OperatorContext';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '../ui/command';
import { toast } from 'sonner';
import { ChevronsUpDown, Check, Loader2, UserSearch } from 'lucide-react';
import { cn } from '../ui/utils';

interface AddAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  agency: Agency;
  onCreated: () => void;
}

function contactDisplayName(c: MoovsContact): string {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  return parts.join(' ') || '(No name)';
}

function contactLabel(c: MoovsContact): string {
  const name = contactDisplayName(c);
  const extras: string[] = [];
  if (c.position) extras.push(c.position);
  if (c.email) extras.push(c.email);
  return extras.length > 0 ? `${name} — ${extras.join(' | ')}` : name;
}

export function AddAgentDialog({ open, onOpenChange, agencyId, agency, onCreated }: AddAgentDialogProps) {
  const operator = useOperator();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AgentRole>('agent');
  const [department, setDepartment] = useState('');
  const [creating, setCreating] = useState(false);

  // Moovs contact lookup state
  const [contacts, setContacts] = useState<MoovsContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsFailed, setContactsFailed] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const hasFetchedRef = useRef(false);

  const hasMoovsCompany = !!agency.moovs_company_id;

  // Fetch contacts when dialog opens
  useEffect(() => {
    if (!open) {
      hasFetchedRef.current = false;
      return;
    }
    if (!hasMoovsCompany || hasFetchedRef.current) return;

    hasFetchedRef.current = true;
    let cancelled = false;

    async function loadContacts() {
      try {
        setContactsLoading(true);
        setContactsFailed(false);
        const result = await fetchMoovsContacts(
          operator.moovsOperatorId,
          agency.moovs_company_id!,
        );
        if (!cancelled) {
          setContacts(result.contacts);
        }
      } catch (err) {
        console.error('Failed to fetch Moovs contacts:', err);
        if (!cancelled) setContactsFailed(true);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    }

    loadContacts();
    return () => { cancelled = true; };
  }, [open, hasMoovsCompany, operator.moovsOperatorId, agency.moovs_company_id]);

  function resetForm() {
    setName('');
    setEmail('');
    setPhone('');
    setRole('agent');
    setDepartment('');
    setSelectedContactId(null);
    setContacts([]);
    setContactsFailed(false);
  }

  function handleSelectContact(contactId: string | null) {
    setSelectedContactId(contactId);
    setComboboxOpen(false);

    if (!contactId) {
      // "None — manual entry" selected
      setName('');
      setEmail('');
      setPhone('');
      setDepartment('');
      return;
    }

    const contact = contacts.find((c) => c.contact_id === contactId);
    if (!contact) return;

    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
    setName(fullName);
    setEmail(contact.email || '');
    setPhone(contact.mobile_phone || '');
    if (contact.position) {
      setDepartment(contact.position);
    }
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

  const selectedContact = selectedContactId
    ? contacts.find((c) => c.contact_id === selectedContactId)
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Moovs Contact Lookup */}
          {hasMoovsCompany && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <UserSearch className="h-3.5 w-3.5" />
                Import from Moovs
              </Label>
              {contactsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading contacts...
                </div>
              ) : contactsFailed ? (
                <p className="text-xs text-gray-400">Could not load Moovs contacts. Enter details manually.</p>
              ) : (
                <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboboxOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {selectedContact
                          ? contactDisplayName(selectedContact)
                          : 'Select a Moovs contact...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search contacts..." />
                      <CommandList>
                        <CommandEmpty>No contacts found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__none__"
                            onSelect={() => handleSelectContact(null)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedContactId === null ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            None — manual entry
                          </CommandItem>
                          {contacts.map((contact) => (
                            <CommandItem
                              key={contact.contact_id}
                              value={contactLabel(contact)}
                              onSelect={() => handleSelectContact(contact.contact_id)}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedContactId === contact.contact_id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{contactDisplayName(contact)}</span>
                                <span className="text-xs text-gray-400 truncate">
                                  {[contact.position, contact.email].filter(Boolean).join(' | ')}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}

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
