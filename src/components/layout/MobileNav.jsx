import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, LineChart, Settings, Target } from 'lucide-react';
import { motion } from 'framer-motion';

const MobileNav = () => {
  const [hidden, setHidden] = React.useState(false);
  const lastYRef = React.useRef(typeof window !== 'undefined' ? window.scrollY : 0);
  const tickingRef = React.useRef(false);

  React.useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      const last = lastYRef.current;
      const dy = y - last;
      lastYRef.current = y;
      // Debounce excessive oscillation with a small threshold
      if (Math.abs(dy) < 5) return;
      if (!tickingRef.current) {
        window.requestAnimationFrame(() => {
          setHidden(dy > 0); // scrolling down -> hide; up -> show
          tickingRef.current = false;
        });
        tickingRef.current = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems = [
    { to: '/', icon: Target, label: 'Monitor' },
    { to: '/bsr-performance', icon: BarChart3, label: 'Performance' },
    { to: '/analysis', icon: LineChart, label: 'Analisi' },
    { to: '/settings', icon: Settings, label: 'Impostazioni' },
  ];

  return (
    <motion.div 
      initial={{ y: 100 }}
      animate={{ y: hidden ? 100 : 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border z-50"
    >
      <nav className="flex justify-around items-center h-16">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full transition-colors duration-200 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            <item.icon className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </motion.div>
  );
};

export default MobileNav;