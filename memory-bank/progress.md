# Progress

## 2026-01-26
- Implemented multi-page Dutch website for Menyentuh (HTML/CSS/JS).
- Added landing page with appointment mock and WhatsApp CTA.
- Added Over, Behandelingen, Tarieven, and Contact pages.
- Completed warm gold + crème + deep green visual system with paper texture overlay and refined component styling.
- Added day selection with time-slot filtering and hero illustration update.
- Moved AI hero illustration outside the card for improved layout balance.
- Replaced hero illustration with user-provided PNG asset.

## 2026-01-30
- Moved website files from `src/` to repository root for deployment.
- Updated docs to reference root-level file paths.

## 2026-02-18
- Updated contact form flow to use direct FormSubmit POST with redirect and inline feedback.
- Added success feedback on return to the contact page.
- Identified email delivery blockage: `info@menyentuh.nl` currently not receiving mail; FormSubmit activation pending until DNS/MX is fixed.
- Audited public DNS for `menyentuh.nl`: NS points to Vercel, no MX/TXT/DMARC/DKIM records published.
- Added TransIP mail DNS records in Vercel for `menyentuh.nl` (MX/SPF/DMARC/DKIM + autoconfig/autodiscover).
- Verified DNS resolution via `nslookup` for MX/TXT/DMARC/DKIM and CNAMEs.
- Added Resend outbound DNS records in Vercel for `menyentuh.nl` (`resend._domainkey` TXT, `send` MX, `send` SPF TXT).
- Verified Resend DNS propagation via `vercel dns ls` and `nslookup`.
- Linked local repo to Vercel project and set `RESEND_API_KEY` for production/preview (sensitive) and development (standard).
- Implemented Vercel `/api/contact` endpoint to send mail via Resend and switched contact form to submit via fetch with clear success/error feedback.
