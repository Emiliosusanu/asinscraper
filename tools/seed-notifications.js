#!/usr/bin/env node
/*
 Seed script: create 3 demo ASINs and synthetic history for notifications
 Usage:
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_USER_ID=... node tools/seed-notifications.js
*/

import { createClient } from '@supabase/supabase-js';

function rnd(min, max) { return Math.random() * (max - min) + min; }
function randint(min, max) { return Math.floor(rnd(min, max + 1)); }

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.DEMO_USER_ID;
  if (!url || !key || !userId) {
    console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_ID');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  const demoAsins = [
    { asin: 'B00DEMO001', title: 'Aruba Travel Guide 2025', country: 'com', page_count: 180, price: 13.1 },
    { asin: 'B00DEMO002', title: 'Daily Vagus Nerve Exercises', country: 'com', page_count: 220, price: 18.21 },
    { asin: 'B00DEMO003', title: 'Costa Rica Travel Guide 2025', country: 'com', page_count: 200, price: 15.75 },
  ];

  for (const item of demoAsins) {
    // Upsert asin_data
    const { data: existing, error: qerr } = await supabase
      .from('asin_data')
      .select('id')
      .eq('asin', item.asin)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (qerr) throw qerr;

    let asinId = existing?.id;
    if (!asinId) {
      const { data: ins, error: insErr } = await supabase
        .from('asin_data')
        .insert({ ...item, user_id: userId })
        .select('id')
        .single();
      if (insErr) throw insErr;
      asinId = ins.id;
    }

    // Generate 60 days of history, with a mild trend
    const start = new Date(); start.setDate(start.getDate() - 60);
    const rows = [];
    let bsr = randint(30000, 90000);
    let price = item.price;
    let reviews = randint(0, 50);
    for (let i = 0; i < 60; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      // create some variance
      bsr = Math.max(1000, Math.round(bsr + randint(-1200, 1200) + (i > 30 ? -300 : 0)));
      price = Math.max(6, Number((price + rnd(-0.2, 0.25)).toFixed(2)));
      reviews = Math.max(0, reviews + (Math.random() < 0.35 ? 1 : 0));
      rows.push({ asin_data_id: asinId, created_at: d.toISOString(), bsr, price, review_count: reviews });
    }

    // Insert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error: insHistErr } = await supabase.from('asin_history').insert(batch);
      if (insHistErr) {
        if (!insHistErr.message.includes('duplicate')) throw insHistErr;
      }
    }
  }

  console.log('Seed completed');
}

main().catch((e) => { console.error(e); process.exit(1); });
