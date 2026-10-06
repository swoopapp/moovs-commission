import { Building2, LayoutDashboard, Link2, Route, X, ClipboardCheck, CalendarCheck } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { WORKSPACE_NAVIGATION, type WorkspaceSection } from '../../lib/workspace-navigation';
import { useOperator } from '../../contexts/OperatorContext';

const icons = { overview: LayoutDashboard, agencies: Building2, matching: Link2, 'route-rates': Route, review: ClipboardCheck, settlement: CalendarCheck };

function NavigationLinks({ section, onNavigate }: { section: WorkspaceSection; onNavigate?: () => void }) {
  return (
    <nav aria-label="Commissions navigation" className="space-y-1 px-3">
      {WORKSPACE_NAVIGATION.map((item) => {
        const Icon = icons[item.section];
        const active = section === item.section;
        return (
          <a
            key={item.section}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

function WorkspaceIdentity() {
  const operator = useOperator();
  return (
    <div className="mx-3 mb-4 rounded-md border border-gray-200 px-3 py-3">
      <p className="text-xs text-gray-500">Operator workspace</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-900">{operator.displayName}</p>
    </div>
  );
}

export function WorkspaceSidebar({ section }: { section: WorkspaceSection }) {
  return (
    <aside className="sticky top-[73px] hidden h-[calc(100dvh-73px)] w-[224px] shrink-0 border-r border-gray-200 bg-white pt-5 pb-16 lg:block">
      <WorkspaceIdentity />
      <NavigationLinks section={section} />
    </aside>
  );
}

// Escape, focus trapping and focus return are handled by Radix.
export function MobileWorkspaceNavigation({ section, onNavigate }: { section: WorkspaceSection; onNavigate: () => void }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
      <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(320px,calc(100vw-32px))] overflow-y-auto bg-white py-5 shadow-xl lg:hidden">
        <div className="mb-5 flex items-center justify-between px-5">
          <Dialog.Title className="text-base font-semibold text-gray-900">Commissions</Dialog.Title>
          <Dialog.Close className="flex h-11 w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Close navigation">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">Navigate your operator commission workspace.</Dialog.Description>
        <WorkspaceIdentity />
        <NavigationLinks section={section} onNavigate={onNavigate} />
      </Dialog.Content>
    </Dialog.Portal>
  );
}
