import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, LineChart, Settings, LogOut, Target, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/components/ui/use-toast';

const Sidebar = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out successfully." });
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: Target, label: 'Monitoraggio ASIN' },
    { to: '/bsr-performance', icon: BarChart3, label: 'Performance BSR' },
    { to: '/analysis', icon: LineChart, label: 'Stime & Analisi' },
    { to: '/settings', icon: Settings, label: 'Impostazioni' },
  ];

  return (
    <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-64 xl:w-72 bg-background/60 backdrop-blur-xl border-r border-border/50 transition-all duration-300 ease-in-out z-40">
      <div className="flex flex-col h-full p-6">
        <div className="flex items-center gap-3 mb-12">
          <Bot className="w-10 h-10 text-primary" />
          <span className="text-2xl font-bold text-foreground">ASIN-SaaS</span>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center p-3 rounded-lg transition-colors duration-200 text-muted-foreground hover:text-foreground hover:bg-muted/50 ${
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : ''
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="ml-4 font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div>
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center p-3">
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              onClick={handleSignOut}
              variant="ghost"
              className="w-full flex items-center justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-5 h-5" />
              <span className="ml-4">Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;