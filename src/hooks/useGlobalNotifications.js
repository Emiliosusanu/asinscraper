import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

function toDateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeCountsFromSnapshots(snaps) {
  let better = 0, worse = 0, stable = 0;
  for (const s of snaps || []) {
    const qi = typeof s.qi_score === 'number' ? s.qi_score : null;
    const mo = typeof s.momentum_7 === 'number' ? s.momentum_7 : null;
    // Heuristics: good momentum when negative; bad when positive; qi extremes reinforce
    const isBetter = (qi != null && qi >= 80) || (mo != null && mo < -0.02);
    const isWorse = (qi != null && qi <= 40) || (mo != null && mo > 0.02);
    if (isBetter) better++; else if (isWorse) worse++; else stable++;
  }
  return { better, worse, stable };
}

export default function useGlobalNotifications() {
  const { user } = useAuth();
  const today = toDateKey(new Date());
  const chRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    let disposed = false;

    const loadAndStore = async () => {
      try {
        const [{ data: snaps }, { data: evs }] = await Promise.all([
          supabase
            .from('performance_snapshots')
            .select('qi_score, momentum_7, asin_data_id, day')
            .eq('user_id', user.id)
            .eq('day', today),
          supabase
            .from('notification_events')
            .select('title, severity, status, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);
        if (disposed) return;

        const counts = computeCountsFromSnapshots(snaps || []);
        const messages = Array.isArray(evs) ? evs.slice(0, 3).map(r => r.title).filter(Boolean) : [];

        const fingerprint = JSON.stringify({ day: today, counts, top: messages.join('|') });
        const payload = { ts: Date.now(), fingerprint, counts, messages };
        try {
          localStorage.setItem('globalNotifications', JSON.stringify(payload));
          window.dispatchEvent(new Event('globalNotificationsUpdated'));
        } catch (_) {}
      } catch (e) {
        // fail silently; UI will remain quiet
      }
    };

    loadAndStore();

    if (chRef.current) {
      supabase.removeChannel(chRef.current);
      chRef.current = null;
    }
    const ch = supabase.channel(`realtime-global-notifs:${user.id}`);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'performance_snapshots' }, (payload) => {
      const row = payload.new || payload.record || null;
      if (!row || row.user_id !== user.id) return;
      if (row.day !== today) return;
      loadAndStore();
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'notification_events' }, (payload) => {
      const row = payload.new || payload.record || null;
      if (!row || row.user_id !== user.id) return;
      loadAndStore();
    });
    ch.subscribe();
    chRef.current = ch;

    return () => {
      disposed = true;
      if (chRef.current) supabase.removeChannel(chRef.current);
      chRef.current = null;
    };
  }, [user?.id, today]);
}
