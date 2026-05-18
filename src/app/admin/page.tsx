import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminPanel } from '@/components/admin/AdminPanel';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/auth/sign-in?callbackUrl=/admin');
  }

  return <AdminPanel />;
}
