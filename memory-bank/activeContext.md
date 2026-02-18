# Active Context

## Current Work
- Moved site files from `src/` to the repository root (HTML, css, assets, js, 404/robots/sitemap).
- Updated documentation paths to match the new root-level structure.
- Updated contact form submission to use direct FormSubmit POST with a success redirect parameter and on-page success feedback.
- Verified local flow; FormSubmit activation is blocked because `info@menyentuh.nl` is not receiving email (DNS/MX issue).
- Added required mail DNS records in Vercel (MX, SPF, DMARC, DKIM, autoconfig/autodiscover) for `menyentuh.nl`.
- Verified DNS propagation via Vercel DNS list and `nslookup` for MX/TXT/DMARC/DKIM/CNAMEs.
- Added Resend outbound DNS records in Vercel for `menyentuh.nl`: `resend._domainkey` TXT, `send` MX, `send` SPF TXT (kept TransIP inbound records intact).
- Verified Resend records via `vercel dns ls` and `nslookup` (TXT/MX/TXT).
- Linked local repo to Vercel project `tunuxs-projects/menyentuh` (created `.vercel`, updated `.gitignore`).
- Set Vercel env var `RESEND_API_KEY` for production + preview (sensitive) and development (non-sensitive due to Vercel restriction).
- Added a Vercel API route for Resend email delivery and switched the contact form to POST to `/api/contact` with fetch-based success/error feedback.

## Next Steps
- Verify content accuracy (contact details, pricing, opening hours).
- Optional: add real booking integration if required later.
- Validate Resend delivery end-to-end in production (submit form and confirm mail arrival).
