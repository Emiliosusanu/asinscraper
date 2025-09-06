import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import NotificationPet from '@/components/NotificationPet';

const DashboardLayout = ({ children }) => {
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
    </div>
  );
};

export default DashboardLayout;