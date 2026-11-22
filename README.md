# Voiz of Aram: Public Voice. Real Action.
### Booth-level campaign workspace for Tamil Nadu candidates

**Voiz of Aram** gives candidates and their booth teams four things:
- booth-level voter insights
- voter tagging, with a household view
- segmented outreach
- a task board for booth agents

The interface is in English and Tamil. It was built after analysing tnedms.com. See [docs/RESEARCH.md](docs/RESEARCH.md) for the full teardown, what we improved and the roadmap.

> **Real data comes from the electoral roll you import.** Until a booth's roll is imported, that booth shows synthetic sample voters so the app can be explored. Set `SETHU_SYNTHETIC=0` in production to switch the samples off.

## Getting real voter data in
1. **Import roll** (`/app/import`): upload a booth's roll PDF or page photos. Pages are read one at a time:
   - *Digital PDF*: read exactly from the PDF text layer.
   - *Scans/photos, offline*: Tesseract OCR (Tamil + English) runs in the browser. Grid lines are detected so each column of voter boxes is read separately.
   - *Scans/photos, AI*: when `ANTHROPIC_API_KEY` is set, each page image goes to Claude (`claude-opus-5-5`, structured JSON output, automatic refusal fallback). This copes best with Tamil names and poor scans.

   Every row is shown in an editable review table before anything is saved. Saving merges by EPIC, so a re-import updates voters instead of duplicating them, and the polling-station name is taken from the page header.
2. **Field capture** (`/app/capture`): photograph an EPIC card, voter slip or paper form. The details are filled in automatically, you confirm them and save. A voter whose EPIC is already on the roll gets their record updated. Mobile numbers are saved only with a consent tick. The photo is never stored.
3. **Booth agent links**: on the Team page, the **Field link** button sends a volunteer a WhatsApp link (`/field/<token>`). It works for 60 days and only for their booths, and it stops working when you remove the volunteer.

## Quick start

```bash
npm install
npm run build      # build the React app into dist/
npm start          # API and app on http://localhost:5174
# or, for live reload while developing:
npm run dev        # API on :5174, Vite on http://localhost:5173
```

Requires **Node 22.5 or later**, for the built-in `node:sqlite`. There are no native modules to compile.

| Account | Mobile | Passcode |
|---|---|---|
| Demo candidate (active plan, Mylapore, 12 booths) | `9000000000` | `demo1234` |
| Admin console | `9999999999` | `admin1234` (override with `SETHU_ADMIN_PASSCODE`) |

In development, OTP codes appear on screen and in the server log. Set the `WHATSAPP_*` env vars to send them over the WhatsApp Cloud API instead.

## Tests

```bash
npm test                                  # 28 API, parser, import/capture and security tests (Vitest + Supertest, Claude mocked)
npm run build && npm start                # then, in another terminal:
node tests/e2e.mjs http://localhost:5174          # 17-step browser journey (Playwright + system Edge/Chrome)
node tests/e2e-import.mjs http://localhost:5174   # roll import (PDF + OCR), review, commit, agent field capture
node tests/make-sample-roll.mjs                   # regenerate the fictional sample roll / ID-card fixtures
node tests/shots-marketing.mjs                    # re-capture the app screenshots used on the landing page
```

The E2E run covers the following, and saves screenshots to `e2e-shots/`:
- landing page and the EN/Tamil toggle
- pricing calculator
- OTP sign-up with validation
- booth picker
- free-preview masking
- UPI QR and UTR submission
- admin approval
- unmasked voters and tagging
- booth map and report
- outreach
- team board
- login errors
- 390 px mobile layouts with no horizontal scroll
- dark mode

## Architecture

```
client/            React 18 + Vite + React Router + react-leaflet (no UI framework; own design system in styles.css)
  src/i18n.jsx     EN / Tamil dictionary
  src/pages/       Landing, Register (4-step wizard), Login (passcode / OTP / reset)
  src/pages/app/   Overview, Booths (map), BoothReport (print), Voters, Outreach, Team, Billing, Admin
server/            Express + node:sqlite
  app.js           all routes (public, auth, candidate, admin, payment webhook)
  db.js            schema + seed (demo and admin users)
  data/geo.js      38 districts, 200+ assembly constituencies, synthetic booths
  lib/voters.js    deterministic synthetic electoral roll + masking
  lib/pricing.js   booth slabs, GST, broadcast rates
  lib/security.js  HMAC-signed tokens, scrypt passcodes, OTP hashing
  lib/notify.js    WhatsApp Cloud API adapter (dev: console)
tests/             api.test.js (Vitest), e2e.mjs (Playwright)
```

### Environment variables
| Var | Purpose |
|---|---|
| `PORT` | default `5174` |
| `SETHU_SECRET` | token signing key. **Required in production**; otherwise sessions reset on restart. |
| `SETHU_DB` | SQLite path, default `data/sethu.db` |
| `SETHU_ADMIN_PASSCODE` | seed admin passcode |
| `SETHU_UPI_VPA` | UPI ID shown in the payment QR |
| `SETHU_WEBHOOK_SECRET` | HMAC secret for `POST /api/payments/webhook` (auto-activation from a gateway) |
| `SETHU_ELECTION_DATE` | default polling date for the demo countdown |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_OTP_TEMPLATE` | send OTPs over WhatsApp |
| `ANTHROPIC_API_KEY` | turns on AI reading of roll pages and field photos (Claude). Without it, offline OCR is used |
| `SETHU_EXTRACT_ENGINE` | `claude` or `ocr` to force a reading method |
| `SETHU_EXTRACT_MODEL` | override the Claude model (default `claude-opus-5-5`) |
| `SETHU_SYNTHETIC` | `0` hides the synthetic sample voters for booths without an imported roll |
| `NODE_ENV=production` | hides dev OTP codes and demo credential hints |

To reset local data, run `npm run seed:reset`.

## Photos
The landing-page photographs come from Pexels (free licence; credits are in the page footer): Alen J, Roman Saienko, Renjith Tomy Pkm, Ahila devi Manoharan and Subbu Rayan. The app screenshots are real captures of Sethu running on sample data.

## Known limits
- Broadcasts go into a review queue only. No SMS, WhatsApp or voice messages are actually sent.
- The session token is stored in `localStorage`. Move it to httpOnly cookies before production.
- Rate limiting is in-memory, per process.
- There are no sub-accounts yet for managers or booth agents (see the roadmap).
- The AI reading path is covered by mocked tests only. It has not yet run against the live API, because no key was available while this was built.
- **No API key is needed.** Without `ANTHROPIC_API_KEY`, all reading happens on the user's device. Measured on the fictional Tamil sample roll (`node tests/ocr-bench.mjs`): 15/15 voters found, EPIC 14/15, relation, house, age and gender 15/15, exact Tamil name 12/15. The misses are single letters or a missing space. Real scans vary, so names should always be checked in the review table.
- Booth coordinates on the map are approximate. Real polling-station locations still need to be loaded.
