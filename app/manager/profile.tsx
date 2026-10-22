import React from 'react';
import { ProfileView } from '@/components/ProfileView';

export default function ManagerProfile() {
  return <ProfileView shell="manager" />;
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/RouteError';
