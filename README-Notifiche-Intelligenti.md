# Notifiche Intelligenti (notifications.v1)

Questa sezione descrive l'implementazione del Notification Center “Notifiche Intelligenti” per KDP Insights Pro.

## Architettura

- Edge Function (Supabase/Deno): `supabase/functions/generate_notifications/`
- Tabelle DB (idempotenti): `supabase/migrations/20250910_notifications.sql`
- API (Vercel Edge):
  - `GET /api/notifications?asin=&limit=&since=` — snapshots paginati
  - `POST /api/notifications-feedback` — salva feedback e aggiorna pesi
  - `GET /api/notifications-summary?user_id=` — contatori Better/Worse/Stable e net impact medio 30d
- Cron (Vercel): `vercel.json` → `crons` chiama `/api/cron-generate-notifications` ogni giorno h 04:00 UTC
- UI (feature-flag): `src/components/SmartNotificationsDrawer.tsx`, attivabile con `VITE_NOTIFICATIONS_V1=1`

## Variabili d’Ambiente

Client (Vite, `.env.local`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_NOTIFICATIONS_V1=1` per abilitare l’UI

Server (Vercel Project Settings → Environment Variables):
- `SUPABASE_URL` (uguale a VITE_SUPABASE_URL)
- `SUPABASE_ANON_KEY` (uguale a VITE_SUPABASE_ANON_KEY)
- `SUPABASE_SERVICE_ROLE_KEY` (solo server, non esporre al browser)

## Migrazioni

Esegui le migrazioni in Supabase (SQL Editor oppure CLI):
- File: `supabase/migrations/20250910_notifications.sql`
- Sicure e idempotenti: creano
  - `notification_snapshots`
  - `notification_daily_rollup`
  - `notification_feedback`
  - indici e RLS owner-based

## Deploy Edge Function

Con Supabase CLI:
```bash
supabase functions deploy generate_notifications
```
La funzione risponde a: `https://<PROJECT>.supabase.co/functions/v1/generate_notifications?user_id=<OPTIONAL>&windowDays=30`

## Cron Vercel

In `vercel.json` è definita una Cron che chiama `/api/cron-generate-notifications` ogni giorno. Assicurati che in Vercel ci siano le env server-side (soprattutto `SUPABASE_SERVICE_ROLE_KEY`).

## API Examples (curl)

```bash
# Summary (Bearer = access_token Supabase)
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/notifications-summary?windowDays=30"

# Snapshots
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/notifications?limit=50"

# Feedback
curl -X POST "$BASE_URL/api/notifications-feedback" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"notification_id":"<uuid>","asin":"B00...","action":"helpful","driverSign":"positive"}'
```

## Regole di Calcolo

- Finestra: `curr = ultimi 30 giorni`, `prev = 30 giorni prima` (parametro `windowDays` esposto)
- MoM%: `((curr − prev) / max(prev, ε)) × 100` con `ε=1e-9`
- Review velocity: `Δ(recensioni) / giorni attivi`, soglia ±0.1/giorno
- BSR medio: rolling average, soglia ±3% (nota: BSR migliore ⇒ valore più basso)
- Royalty: pipeline BSR→vendite→royalty esistente riutilizzata
- Prezzo: soglia ±1%
- Confidence: alta se giorni coperti ≥14 e campioni ≥50; media se giorni ≥7; altrimenti bassa
- Zero-guard: scarta campioni con 0 fittizi (bsr=0, price=0). Se tutti 0, `status=Stable, netImpact=0, confidence=low`
- Status: `Better` se (driverScore > 0 e MoM% > +1%); `Worse` se (driverScore < 0 e MoM% < −1%); altrimenti `Stable`
- Net Impact%: media pesata delle variazioni normalizzate su drivers (pesi iniziali: reviews 0.35, bsr 0.30, royalty 0.25, price 0.10)
- Recommendations: in base a status

## Auto-learning leggero

- Tabella `notification_feedback` salva `clicked | dismissed | helpful | ignored`
- Pesi aggiornati con EMA: `w_new = 0.95*w_old + 0.05*signal` con clamp `[0.05, 0.6]` e rinormalizzazione
- `signal = +1` se helpful/clicked su driver positivo; `-1` se helpful su driver negativo (early-warning); `0` se dismissed/ignored

## UI

- Drawer (`SmartNotificationsDrawer`) mostra summary, lista, dettagli e bottone “Utile”
- Attivazione via feature-flag `VITE_NOTIFICATIONS_V1=1`

## Seed Dati Demo

Script: `tools/seed-notifications.js`
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_USER_ID=<UUID> \
node tools/seed-notifications.js
```

## Test (Deno)

```bash
# Esegui test helpers
cd supabase/functions/_shared
deno test -A notifications.test.ts
```

## Accettazione tecnica

- Migrazioni idempotenti
- Funzione Edge coerente su dataset fittizio
- Zero non compaiono in grafici; MoM non inquinato
- UI e JSON allineati
- Latenza: < 800ms su 50 ASIN (dipende dal piano e dal dataset)
- Unit test di utilità (moving average implicita, MoM%, netImpact, confidence, zero-guard)
