import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AsinMonitoring from '@/pages/AsinMonitoring';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import { Toaster } from '@/components/ui/toaster';
import { Loader2 } from 'lucide-react';
import PortfolioAnalysis from '@/pages/PortfolioAnalysis';
import AnalysisTools from '@/pages/AnalysisTools';
import MobileNav from '@/components/layout/MobileNav';

// Emilio: Main App component, handles routing.
function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-16 h-16 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route 
          path="/*" 
          element={
            user ? (
              <DashboardLayout>
                <Routes>
                  <Route path="/" element={<AsinMonitoring />} />
                  <Route path="/bsr-performance" element={<PortfolioAnalysis />} />
                  <Route path="/analysis" element={<AnalysisTools />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </DashboardLayout>
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
      </Routes>
      {user && <MobileNav />}
      <Toaster />
    </>
  );
}

export default App;