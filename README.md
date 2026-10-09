[# Menyentuh](README.md:1)

Een serene, meertalige landingwebsite in het Nederlands voor massagepraktijk **Menyentuh** van Quirina Maas. De site bevat meerdere pagina’s met informatie over behandelingen, tarieven en contact, plus een statische tijdslot‑weergave en WhatsApp‑knop.

[## Pagina’s](README.md:5)
- Home (landing): `index.html`
- Over: `over.html`
- Behandelingen: `behandelingen.html`
- Tarieven: `tarieven.html`
- Contact: `contact.html`
- Afspraak plannen: `afspraak.html`
- Afspraken beheren (verborgen): `beheer-afspraken.html`

[## Starten](README.md:12)
Open `index.html` in je browser. Er is geen build‑stap nodig.

[## Boekingsmodule](README.md:15)
Bezoekers plannen zelf een afspraak op `afspraak.html`; Quirina beheert de
tijdsloten op `beheer-afspraken.html`. De module draait op Vercel‑functies
met Supabase als opslag. Installatie en databaseschema staan in
`docs/booking-setup.md`.

[## Aanpassen](README.md:21)
- Kleuren, typografie en layout: `css/styles.css`
- Styling boekingsmodule: `css/booking.css`
- Interactie (tijdslot selecteren + mailto): `js/main.js`
- Content per pagina: bestanden in de root

## Caching
HTML wordt met `Cache-Control: no-cache` geserveerd, zodat bezoekers na een
deploy direct de nieuwe versie zien. Bestanden in `css/`, `js/` en `assets/`
worden een jaar gecachet (zie `vercel.json`). Daarom:
- Na een wijziging in een CSS- of JS-bestand: verhoog `?v=` in de links in
  alle HTML-pagina's (bijv. `css/styles.css?v=20261009` → nieuwe datum).
- Vervang een afbeelding nooit onder dezelfde bestandsnaam; geef de nieuwe
  versie een nieuwe naam en pas de verwijzingen aan.
