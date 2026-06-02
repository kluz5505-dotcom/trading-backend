import type { ReactNode } from 'react';
import { AdminAuthGuard } from '@/admin/guards/AdminAuthGuard';
import { AdminLayout } from '@/admin/components/layout/AdminLayout';

interface AdminProtectedRouteProps {
  children?: ReactNode;
  activeSection?: string;
  title?: string;
  subtitle?: string;
  role?: string;
}

export function AdminProtectedRoute({
  children,
  activeSection = 'dashboard',
  title = 'Exchange Admin Control Center',
  subtitle = 'Backend exchange administration',
  role = 'admin',
}: AdminProtectedRouteProps) {
  return (
    <AdminAuthGuard>
      <AdminLayout
        activeSection={activeSection}
        title={title}
        subtitle={subtitle}
        role={role}
      >
        {children}
      </AdminLayout>
    </AdminAuthGuard>
  );
}
