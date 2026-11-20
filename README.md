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
- Vergeten gebeurt makkelijk: op 20 november 2026 kreeg de duomassage-kaart
  nieuwe CSS zonder `?v=`-ophoging, waardoor bezoekers de nieuwe HTML met de
  oude CSS zagen (prijstabel als losse tekst op één regel). Controleer vóór
  elke push met `git diff --name-only` of er iets in `css/` of `js/` is
  veranderd; zo ja, verhoog `?v=` overal (`sed -i 's/?v=OUD/?v=NIEUW/g' *.html`).

## Controleren vóór publiceren
Bekijk elke zichtbare wijziging eerst als screenshot, op desktop én mobiel.
Kijk dus niet alleen naar de code.
- Desktop: `chrome --headless=new --window-size=1400,2600 --screenshot=uit.png file:///…/pagina.html`
- Mobiel: Chrome headless heeft een minimale vensterbreedte, dus
  `--window-size=390,…` geeft geen echte telefoonweergave. Zet de pagina in
  een `<iframe style="width:375px">` in een los HTML-bestand en maak daar een
  screenshot van (met `--allow-file-access-from-files`).
