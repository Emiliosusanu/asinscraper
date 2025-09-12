import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import NotificationPet from '@/components/NotificationPet';
import WelcomeChangelogModal from '@/components/WelcomeChangelogModal';
import useGlobalNotifications from '@/hooks/useGlobalNotifications';

const DashboardLayout = ({ children }) => {
  // Populate Pet notifications from performance_snapshots + notification_events
  useGlobalNotifications();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 lg:ml-64 xl:ml-72 pb-24 lg:pb-8">
          {children}
        </main>
      </div>
      <MobileNav />
      {/* Minimal floating notifications pet */}
      <NotificationPet />
      {/* First-login welcome & changelog modal (shows max 2 times per user) */}
      <WelcomeChangelogModal />
    </div>
  );
};

export default DashboardLayout;