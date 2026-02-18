# Active Context

## Current Work
- Moved site files from `src/` to the repository root (HTML, css, assets, js, 404/robots/sitemap).
- Updated documentation paths to match the new root-level structure.
- Updated contact form submission to use direct FormSubmit POST with a success redirect parameter and on-page success feedback.
- Verified local flow; FormSubmit activation is blocked because `info@menyentuh.nl` is not receiving email (DNS/MX issue).
- Added required mail DNS records in Vercel (MX, SPF, DMARC, DKIM, autoconfig/autodiscover) for `menyentuh.nl`.
- Verified DNS propagation via Vercel DNS list and `nslookup` for MX/TXT/DMARC/DKIM/CNAMEs.

## Next Steps
- Verify content accuracy (contact details, pricing, opening hours).
- Optional: add real booking integration if required later.
- Activate the FormSubmit link, then re-test contact form delivery.
