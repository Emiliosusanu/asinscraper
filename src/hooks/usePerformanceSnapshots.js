import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

function toDateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function usePerformanceSnapshots(asinRows) {
  const { user } = useAuth();
  const [byAsinId, setByAsinId] = useState({});
  const channelRef = useRef(null);

  const asinIds = useMemo(() => (Array.isArray(asinRows) ? asinRows.map(a => a.id) : []), [asinRows]);
  const today = useMemo(() => toDateKey(new Date()), []);

  useEffect(() => {
    if (!user || asinIds.length === 0) return;

    let isCancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('performance_snapshots')
        .select('asin_data_id, qi_score, momentum_7, volatility_30, baseline_percentile')
        .eq('user_id', user.id)
        .eq('day', today)
        .in('asin_data_id', asinIds);
      if (!isCancelled && !error && Array.isArray(data)) {
        const map = {};
        for (const r of data) map[r.asin_data_id] = r;
        setByAsinId(map);
      }
    })();

    // Optional realtime updates for INSERT/UPDATE today
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const ch = supabase.channel(`realtime-perf-snapshots:${user.id}`);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'performance_snapshots' }, (payload) => {
      const row = payload.new || payload.record || null;
      if (!row || row.user_id !== user.id) return;
      if (row.day !== today) return;
      setByAsinId(prev => ({ ...prev, [row.asin_data_id]: row }));
    });
    ch.subscribe();
    channelRef.current = ch;

    return () => {
      isCancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [user?.id, today, JSON.stringify(asinIds)]);

  return byAsinId;
}
