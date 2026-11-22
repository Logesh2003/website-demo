# Reference analysis: tnedms.com → our product, Sethu

_Prepared 22 Nov 2026. Source: the public JS/CSS bundle served at tnedms.com (`/assets/index-LXu4wEqU.js`, 1.5 MB), read statically. We did not log in or call private APIs._

## 1. What the reference is

**EDMS (Election Data Management System)** is a paid SaaS tool for Tamil Nadu candidates. It sells booth-level electoral-roll access plus outreach services. It covers Assembly constituencies and rural and urban local-body elections.

| Area | Findings |
|---|---|
| **Stack** | React SPA built with Vite, axios, React Router, Leaflet (OSM and Esri satellite tiles), JsSIP softphone over TeleCMI, SSE streams, Cloudinary for images, Inter font, bilingual EN/Tamil. The page is a 32-byte HTML shell with no SSR, so crawlers see only the title. |
| **Public routes** | `/`, `/register`, `/login`, `/booth-login`, `/demo`, `/faq`, `/terms`, `/privacy`, `/candidate-briefing`, `/field-operations`, `/crm`, `/access-closed` |
| **Candidate app** | dashboard, booths, voters (EPIC search and export), booth-report, assembly-analytics, broadcast and reports, payments, ward dashboard and social-media requests |
| **Internal/admin** | registrations (incomplete and full), team pods and assignment, CRM inbox (WhatsApp 2-way, calls, recordings, lead status, leaderboard, daily digest), flow simulator (WhatsApp bot flows), MLA images and flags, ward logins, WhatsApp templates |
| **Palette** | navy `#1a237e`, blue `#0071e3`/`#1d4ed8`, gold kicker, slate greys |

### Registration flow (as implemented)
1. **Your details**: full name ("as on voter ID") and a 10-digit WhatsApp number.
2. **Role and party**: role (Planning to contest / Confirmed candidate / Campaign team member / Party functionary), affiliation (party or independent), party (DMK, AIADMK, BJP, INC, NTK, PMK, VCK, MDMK, AMMK, DMDK, TVK, Independent, Other).
3. **Your constituency**: body type (rural or urban), position, district (37), local body, ward, assembly, and a booth multi-select.
4. **Submit**: `POST /auth/register`. The **server generates a username and passcode, shows them on screen** and sends them to WhatsApp. An `ALREADY_REGISTERED` error offers a "send my login to WhatsApp" deep link.
- Partial progress is tracked (`POST /public/track` with step=`role`/`start`), so the team can call people who drop off ("incomplete registrations"). UTM, gclid and fbclid attribution is stored in sessionStorage.

### Monetisation and data flow
- Tiered pricing: 1 booth ₹2,000, ≤5 ₹5,000, ≤10 ₹10,000, ≤25 ₹25,000, ≤100 ₹50,000, plus 18% GST.
- Payment is **manual**: a static UPI QR image, then the user uploads a screenshot or types the UTR, then an admin approves it (`/payments/approve-utr`). Activation is "within the hour of our approval".
- Before payment: booth list and sample data. "Your preview access … has concluded" walls appear.
- Broadcasts (SMS, recorded voice, WhatsApp image) are requested in the app, but **pricing and confirmation happen by phone or WhatsApp with staff**.

### Weaknesses we can beat
1. **No mobile verification at sign-up**. Anyone can register any number, and logins are then pushed to the wrong WhatsApp ("What if I typed the wrong WhatsApp number?" is a FAQ).
2. **Server-generated passcodes shown on screen** and sent over WhatsApp. There is no user-chosen secret and no OTP login or self-service reset ("Forgot it? WhatsApp us").
3. **Manual UPI reconciliation** with a static QR. There is no amount-locked intent, no reference ID and no webhook path.
4. **Broadcast cost is opaque** and depends on a human callback.
5. **No campaign workflow**. It is data access plus a staff-run CRM. Candidates cannot tag voters, track sentiment, see households or give work to their own booth agents.
6. **No SSR or SEO**. The landing content is invisible to crawlers and link previews.
7. **Flat 37-district list** with no search in the booth picker on large constituencies (250–300 booths).
8. DPDP is mentioned in copy, but consent is not captured as a record and exports are not audited from the candidate's side.

## 2. Our product: Sethu ("bridge")

**Positioning:** Sethu is a campaign workspace, not a data dump. It covers the same market (TN candidates, Assembly and local body), but the data is the start of a workflow that candidates and their booth agents run themselves.

### Built in this first delivery

| # | Feature | Improvement over the reference |
|---|---|---|
| 1 | **OTP-verified sign-up** (rate-limited, 5-attempt lockout, single-use, HMAC-hashed codes). WhatsApp Cloud API adapter included. | Fixes wrong-number registrations and spoofing |
| 2 | **User-chosen passcode**, plus **OTP login** and **self-service passcode reset** | No secrets shown on screen and no support ticket to recover access |
| 3 | 4-step wizard with **draft autosave**, inline validation, server-side field errors that jump back to the right step, focus management | Fewer drop-offs, accessible |
| 4 | **Election type first** (Assembly, rural or urban), with position and local-body fields only where they apply | Cleaner branching |
| 5 | **Searchable booth picker** (number, school or street), "select all shown", and a **live price quote with GST and the next-slab hint** | Price is clear before commitment |
| 6 | **DPDP consent captured** with timestamp and IP, plus an **audit log** of exports, payments and broadcasts | Compliance you can show |
| 7 | **Freemium preview**: real booth statistics, with names and EPIC masked server-side until payment | Users see value before they pay. Masking is enforced by the API, not the UI. |
| 8 | **UPI intent + dynamic QR** locked to the amount and a unique reference, UTR format and duplicate checks, admin approval, plus an **HMAC-signed gateway webhook** for instant auto-activation | Path from manual to automatic reconciliation |
| 9 | **Booth strength map** (Leaflet) coloured by tagged support, sortable "weakest first" table | Tells you where to act |
| 10 | **Voter tagging** (supporter, leaning, neutral, opposed), contacted flag, notes, **household view** | Real campaign CRM owned by the candidate |
| 11 | **Segment builder → broadcast** with live audience, reachable count and **per-channel cost estimate**, EN/Tamil templates with `{name}`/`{booth}` merge tags, scheduling, compliance review queue | Self-serve and transparent |
| 12 | **Team board**: volunteers assigned to booths and a kanban of tasks (to do, doing, done), WhatsApp deep links | Coordination for booth agents |
| 13 | **Printable booth report** (age bands, sections, households) | Ready for booth committee meetings |
| 14 | **Polling-day countdown** (editable) | Keeps the team focused |
| 15 | **Admin console**: sign-up funnel (landing → started → OTP → verified → registered → paid), payment approvals, broadcast approvals, registrations search, audit log | Ops visibility |
| 16 | Full **EN/தமிழ்** UI toggle, Noto Sans Tamil, dark mode, mobile bottom nav, skip links, keyboard and screen-reader labels | Accessibility and reach |
| 17 | One-tap **demo workspace** with synthetic data | Same as the reference, but every feature is live |

### Roadmap: integrations worth adding next
- **Payments:** Razorpay or Cashfree UPI Collect with auto-reconciliation (webhook already stubbed), GST invoice PDFs, booth add-on top-ups.
- **WhatsApp Business Platform:** 2-way inbox, interactive "Find my booth" bot for voters, template approval pipeline. SMS through DLT-registered providers (MSG91, Gupshup). Voice through Exotel or TeleCMI.
- **AI assist (Claude API):** draft outreach copy in Tamil and English tuned to a segment, summarise volunteer field notes into issues by booth, and a daily briefing ("3 booths dropped in coverage; 212 first-time voters untagged in booth 14").
- **Offline-first PWA for booth agents:** download one booth's roll, tag while walking door to door without signal, sync later. Includes polling-day **turnout tracker** (mark "voted" by serial number and see live turnout by booth).
- **Official data ingestion:** ECI/CEO-TN electoral-roll PDF parser (Tamil OCR), TNSEC ward maps, booth GPS from ECI's polling-station list.
- **Security hardening:** move sessions to httpOnly cookies, optional 2FA for team logins, role-based sub-accounts (candidate, manager, booth agent with read-only access to one booth), field-level encryption of mobile numbers at rest, data-retention auto-purge after results.
- **SEO and SSR** for the marketing site (e.g. pre-rendering), with constituency landing pages.

## 3. Important caveats
- **All booth and voter data in this build is synthetic.** It is generated deterministically. Constituency names are real, but booth names, coordinates and people are not. Production requires licensed or official datasets and legal review of how voter data is processed under the DPDP Act 2023 and ECI rules.
- Pricing tiers are placeholders we chose ourselves (not copied from the reference) and need business sign-off.
- Broadcast "send" is a review queue only. No messages are dispatched.
