# Boekingsmodule — installatie

De boekingsmodule laat bezoekers zelf een afspraak plannen op
[`afspraak.html`](../afspraak.html) en laat Quirina de tijdsloten beheren op
[`beheer-afspraken.html`](../beheer-afspraken.html).

Opslag loopt via **Supabase** (PostgreSQL). De Vercel-functies praten met
Supabase via de REST-API, dus er zijn géén npm-dependencies nodig.

---

## 1. Supabase-project aanmaken

1. Ga naar <https://supabase.com> en maak een gratis project aan.
2. Open in het project **SQL Editor** → **New query**, plak het script
   hieronder en klik **Run**.

```sql
-- ===== Menyentuh boekingsmodule — databaseschema =====

create table if not exists weekly_schedules (
  id          uuid primary key default gen_random_uuid(),
  weekday     smallint not null check (weekday between 0 and 6), -- 0=zondag ... 6=zaterdag
  start_time  time not null,
  end_time    time not null,
  slot_minutes smallint not null default 60,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists slot_overrides (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  start_time  time,                       -- leeg + kind='blocked' = hele dag dicht
  kind        text not null check (kind in ('open','blocked')),
  slot_minutes smallint not null default 60,
  created_at  timestamptz not null default now()
);

create table if not exists bookings (
  id              uuid primary key default gen_random_uuid(),
  slot_date       date not null,
  slot_time       time not null,
  duration_minutes smallint not null default 60,
  treatment       text,
  name            text not null,
  email           text not null,
  phone           text,
  notes           text,
  status          text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at      timestamptz not null default now()
);

-- Twee bevestigde boekingen op exact hetzelfde slot zijn onmogelijk.
create unique index if not exists bookings_unique_confirmed_slot
  on bookings (slot_date, slot_time)
  where status = 'confirmed';

-- Tabellen op slot: alleen de server (service role key) mag erbij.
alter table weekly_schedules enable row level security;
alter table slot_overrides   enable row level security;
alter table bookings         enable row level security;
```

3. Ga naar **Project Settings → API** en noteer:
   - **Project URL** (bijv. `https://abcd1234.supabase.co`)
   - **service_role** key onder *Project API keys* (de geheime, niet de `anon`).

> De `service_role` key omzeilt Row Level Security. Gebruik hem **alleen**
> als server-omgevingsvariabele — nooit in client-side code.

---

## 2. Omgevingsvariabelen in Vercel

Zet onder **Vercel → Project → Settings → Environment Variables**:

| Variabele                   | Waarde                                            |
| --------------------------- | ------------------------------------------------- |
| `SUPABASE_URL`              | de Project URL uit stap 1                         |
| `SUPABASE_SERVICE_ROLE_KEY` | de `service_role` key uit stap 1                  |
| `BOOKING_ADMIN_PASSWORD`    | zelfgekozen wachtwoord voor de beheerpagina       |
| `RESEND_API_KEY`            | bestaat al — gebruikt voor de bevestigingsmails   |

Na het toevoegen één keer opnieuw deployen zodat de variabelen actief worden.

---

## 3. Eerste keer instellen

1. Open `https://menyentuh.nl/beheer-afspraken.html` en log in met
   `BOOKING_ADMIN_PASSWORD`.
2. Voeg onder **Weekschema's** de vaste beschikbaarheid toe
   (bijv. dinsdag 09:00–17:00, 60 min). Hieruit worden automatisch
   boekbare slots voor de komende ~8 weken gegenereerd.
3. Gebruik **Losse aanpassingen** voor uitzonderingen:
   - *Extra slot* — een eenmalig tijdstip op een specifieke datum.
   - *Blokkeren* — een tijd vrijhouden, of (tijd leeg laten) een hele
     dag dicht zetten, bijv. vakantie.
4. Boekingen verschijnen onder **Boekingen**; daar kun je ze annuleren
   of verwijderen.

---

## Hoe het werkt

| Onderdeel              | Bestand                                            |
| ---------------------- | -------------------------------------------------- |
| Boekingspagina         | `afspraak.html` + `js/booking.js`                  |
| Beheerpagina           | `beheer-afspraken.html` + `js/booking-admin.js`    |
| Beschikbare slots (GET)| `api/booking/slots.js`                             |
| Boeking maken (POST)   | `api/booking/book.js`                              |
| Beheer-acties (POST)   | `api/booking/admin.js`                             |
| Gedeelde logica        | `api/_lib/supabase.js`, `api/_lib/booking.js`      |
| Styling                | `css/booking.css`                                  |

Beschikbare slots = weekschema's + losse extra slots − geblokkeerde tijden
− reeds geboekte slots − momenten in het verleden. De berekening gebeurt
server-side in `api/_lib/booking.js` (`generateSlots`), in de tijdzone
Europe/Amsterdam.

## Lokaal testen

`python -m http.server` serveert alleen de statische bestanden — de
`/api`-functies werken daarmee niet. Gebruik voor de boekingsmodule de
Vercel CLI:

```
npm i -g vercel
vercel dev
```

Zet dezelfde omgevingsvariabelen lokaal in een `.env`-bestand of via
`vercel env pull`.
