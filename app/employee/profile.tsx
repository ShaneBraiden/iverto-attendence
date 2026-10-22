import React from 'react';
import { ProfileView } from '@/components/ProfileView';

export default function EmployeeProfile() {
  return <ProfileView shell="employee" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';
