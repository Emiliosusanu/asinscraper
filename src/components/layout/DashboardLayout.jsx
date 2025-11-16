import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import NotificationPet from '@/components/NotificationPet';
import WelcomeChangelogModal from '@/components/WelcomeChangelogModal';
import useGlobalNotifications from '@/hooks/useGlobalNotifications';

const SnowOverlay = ({ enabled = true }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!enabled) return;
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mq && mq.matches) return;
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    let w = 0, h = 0, dpr = Math.max(1, window.devicePixelRatio || 1);
    let flakes = [];
    let rid = 0;
    let last = performance.now();
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.max(1, window.devicePixelRatio || 1);
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = Math.min(160, Math.max(40, Math.floor((w * h) / 30000)));
      flakes = new Array(density).fill(0).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.8 + Math.random() * 2.2,
        sp: 18 + Math.random() * 34,
        drift: Math.random() * 0.6 + 0.2,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 2;
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        f.y += f.sp * dt;
        f.x += Math.sin(f.phase + f.y * 0.02) * f.drift;
        if (f.y - f.r > h) { f.y = -f.r; f.x = Math.random() * w; f.phase = Math.random() * Math.PI * 2; }
        if (f.x < -10) f.x = w + 10; if (f.x > w + 10) f.x = -10;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rid = requestAnimationFrame(step);
    };
    resize();
    last = performance.now();
    rid = requestAnimationFrame(step);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(rid); window.removeEventListener('resize', resize); };
  }, [enabled]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-10 opacity-80" />;
};

const DashboardLayout = ({ children }) => {
  // Populate Pet notifications from performance_snapshots + notification_events
  useGlobalNotifications();
  const isXmas = React.useMemo(() => {
    try {
      const d = new Date();
      const m = d.getMonth();
      const day = d.getDate();
      const force = (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env.VITE_FORCE_XMAS === '1');
      return force || m === 11 || (m === 10 && day >= 15) || (m === 0 && day <= 6);
    } catch (_) { return false; }
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      {isXmas && <SnowOverlay enabled />}
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