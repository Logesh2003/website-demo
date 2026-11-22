import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { SiteHeader, useToast } from '../components/ui.jsx';
import { api, session, inr, asset } from '../api.js';

const GST = 18;
const FALLBACK_TIERS = [
  { id: 'single', maxBooths: 1, base: 1500, label: 'Single booth' },
  { id: 'ward', maxBooths: 5, base: 4500, label: 'Ward pack (up to 5)' },
  { id: 'cluster', maxBooths: 15, base: 11000, label: 'Cluster (up to 15)' },
  { id: 'block', maxBooths: 40, base: 24000, label: 'Block (up to 40)' },
  { id: 'zone', maxBooths: 120, base: 45000, label: 'Zone (up to 120)' },
  { id: 'constituency', maxBooths: null, base: 75000, label: 'Whole constituency' },
];

// Page copy lives here (the shared dictionary in i18n.jsx covers the app shell and sign-up).
const COPY = {
  en: {
    eyebrow: 'For candidates and campaign teams in Tamil Nadu',
    title: 'Run your booth campaign from your phone.',
    lead: 'Load the electoral roll for your booths, mark who is with you as your team goes door to door, and see each morning which streets still need a visit. In Tamil and English.',
    cta: 'Start free', demo: 'Open the demo', note: 'Booth statistics are free. You pay only to unlock voter names.',
    facts: [['234', 'assembly constituencies'], ['38', 'districts'], ['68,000+', 'polling stations'], ['6.2 crore', 'voters (ECI, 2024)']],
    s1k: 'Step 1', s1t: 'Start from the official roll.', s1d: 'Upload the roll PDF for each booth, or photograph the pages. Voiz of Aram reads every voter box, Tamil or English, and shows you a table to check before anything is saved. Digital PDFs are read exactly; scans and photos are read on your own device, in Tamil and English.',
    s1b: ['Serial number, EPIC, name, relative, house, age, gender', 'Rows that need a second look are highlighted', 'Re-import a revised roll: existing voters are updated, not duplicated'],
    s2k: 'Step 2', s2t: 'Door to door, with the phone already in your pocket.', s2d: 'Send each booth agent a link on WhatsApp. No app to install, no password. They photograph a voter ID card, the details fill in, they note how the conversation went and save. If the voter is already on the roll, the record is updated, not doubled.',
    s2b: ['Works on any Android phone with a browser', 'The photo is read and discarded, never stored', 'Mobile numbers saved only with the voter’s consent'],
    s3k: 'Step 3', s3t: 'Know which booths need you this week.', s3d: 'Every tag your team records rolls up into a strength score for each booth. The map shows where you are strong, where it is close, and where nobody has knocked yet.',
    s4k: 'Step 4', s4t: 'Remember every household.', s4d: 'Open a voter to see their family on the same roll, past notes and how they lean. Call or WhatsApp from the same screen. Plan one visit per house, not five.',
    honest: 'What Voiz of Aram does not do', honestList: ['We do not sell voter lists. You bring the roll you are entitled to; we help you use it.', 'We do not send messages without your approval. Every broadcast is reviewed for Model Code of Conduct and DLT rules.', 'We do not hide prices. You see the full amount, with GST, before you pay.'],
    also: 'Also included', alsoList: [['Segments & outreach', 'First-time voters in booth 12, women over 60: build the list, see reach and cost, send by SMS, WhatsApp or voice.'], ['Team board', 'Tasks per booth, assigned to agents, moved from to-do to done.'], ['Booth reports', 'One printable page per booth for the committee meeting.'], ['Audit trail', 'Imports, exports and payments are logged for DPDP Act accountability.']],
    priceT: 'Pay by booth count. Once.', priceD: 'One payment covers the campaign. Add booths later; the price changes only when you cross a slab.',
    faqT: 'Questions we get asked',
    faq: [
      ['Where does the voter data come from?', 'From the electoral roll you upload. Candidates receive certified copies from the Electoral Registration Officer, and the Chief Electoral Officer, Tamil Nadu publishes final rolls by part. Until you upload a roll, the app shows sample data so you can explore.'],
      ['How accurate is the reading?', 'Digital PDFs are read exactly from their text. Scanned pages are read by OCR on your own device. On clean scans it finds nearly every voter box and gets ages, house numbers and gender right almost every time; Tamil names sometimes need a letter fixed. You always review before saving.'],
      ['Which elections is it for?', 'Assembly constituencies, and rural and urban local body elections: panchayat, municipality and corporation wards.'],
      ['Do booth agents need an account?', 'No. You send each agent a personal link from the Team page. It works for 60 days and stops working the moment you remove them.'],
      ['Is this legal?', 'Electoral rolls are public documents meant for candidates’ use. You must use them only for your campaign, not sell or share them, and follow the DPDP Act 2023. Voiz of Aram records consent and logs exports to help you show that.'],
      ['Is there a refund?', 'If your plan is not active within one working day of payment, you get a full refund.'],
    ],
    endT: 'The roll is public. What you do with it is the campaign.', endD: 'Set up your booths in two minutes and try the import on one part tonight.',
    credits: 'Voiz of Aram · Public Voice. Real Action. Photographs from Pexels: Alen J (Chennai), Roman Saienko (Thanjavur), Renjith Tomy Pkm (Pollachi), Ahila devi Manoharan and Subbu Rayan (Madurai). App screenshots show sample data.',
  },
  ta: {
    eyebrow: 'தமிழ்நாட்டு வேட்பாளர்கள் மற்றும் பிரச்சாரக் குழுக்களுக்கு',
    title: 'உங்கள் சாவடிப் பிரச்சாரத்தை கைபேசியிலிருந்தே நடத்துங்கள்.',
    lead: 'உங்கள் சாவடிகளின் வாக்காளர் பட்டியலை ஏற்றுங்கள். உங்கள் குழு வீடு வீடாகச் செல்லும்போது யார் உங்களுடன் இருக்கிறார்கள் என்று குறியுங்கள். எந்தத் தெருக்களுக்கு இன்னும் செல்ல வேண்டும் என்று ஒவ்வொரு காலையும் பாருங்கள். தமிழிலும் ஆங்கிலத்திலும்.',
    cta: 'இலவசமாகத் தொடங்குக', demo: 'டெமோவைத் திற', note: 'சாவடி புள்ளிவிவரங்கள் இலவசம். வாக்காளர் பெயர்களைத் திறக்க மட்டும் கட்டணம்.',
    facts: [['234', 'சட்டமன்றத் தொகுதிகள்'], ['38', 'மாவட்டங்கள்'], ['68,000+', 'வாக்குச்சாவடிகள்'], ['6.2 கோடி', 'வாக்காளர்கள் (ECI, 2024)']],
    s1k: 'படி 1', s1t: 'அதிகாரப்பூர்வ வாக்காளர் பட்டியலிலிருந்து தொடங்குங்கள்.', s1d: 'ஒவ்வொரு சாவடிக்கும் பட்டியல் PDF-ஐப் பதிவேற்றுங்கள், அல்லது பக்கங்களைப் புகைப்படம் எடுங்கள். தமிழோ ஆங்கிலமோ, ஒவ்வொரு வாக்காளர் பெட்டியையும் Voiz of Aram படித்து, சேமிக்கும் முன் நீங்கள் சரிபார்க்க ஒரு அட்டவணையைக் காட்டும்.',
    s1b: ['வரிசை எண், EPIC, பெயர், உறவினர், வீட்டு எண், வயது, பாலினம்', 'மீண்டும் பார்க்க வேண்டிய வரிசைகள் குறிக்கப்படும்', 'திருத்திய பட்டியலை மீண்டும் ஏற்றினால், இருப்பவை புதுப்பிக்கப்படும், இரட்டிப்பாகாது'],
    s2k: 'படி 2', s2t: 'வீடு வீடாக, உங்கள் பையில் இருக்கும் கைபேசியுடன்.', s2d: 'ஒவ்வொரு சாவடி முகவருக்கும் வாட்ஸ்அப்பில் ஒரு இணைப்பை அனுப்புங்கள். செயலி நிறுவத் தேவையில்லை, கடவுச்சொல் இல்லை. வாக்காளர் அட்டையைப் புகைப்படம் எடுத்தால் விவரங்கள் தானாக நிரம்பும்; பேச்சு எப்படி இருந்தது என்று குறித்துச் சேமிக்கலாம்.',
    s2b: ['உலாவி உள்ள எந்த ஆண்ட்ராய்டு கைபேசியிலும் இயங்கும்', 'புகைப்படம் படிக்கப்பட்டதும் நீக்கப்படும், சேமிக்கப்படாது', 'வாக்காளரின் ஒப்புதலுடன் மட்டுமே கைபேசி எண் சேமிக்கப்படும்'],
    s3k: 'படி 3', s3t: 'இந்த வாரம் எந்தச் சாவடிகளுக்கு நீங்கள் தேவை என்று அறியுங்கள்.', s3d: 'உங்கள் குழு பதிவு செய்யும் ஒவ்வொரு குறியும் சாவடியின் வலிமை மதிப்பெண்ணாக மாறும். எங்கு வலுவாக இருக்கிறீர்கள், எங்கு போட்டி நெருக்கமாக உள்ளது, எங்கு யாரும் இன்னும் செல்லவில்லை என்று வரைபடம் காட்டும்.',
    s4k: 'படி 4', s4t: 'ஒவ்வொரு குடும்பத்தையும் நினைவில் வையுங்கள்.', s4d: 'ஒரு வாக்காளரைத் திறந்தால், அதே பட்டியலில் உள்ள அவர் குடும்பம், முந்தைய குறிப்புகள், அவர் சாய்வு எல்லாம் தெரியும். அதே திரையிலிருந்து அழைக்கலாம் அல்லது வாட்ஸ்அப் செய்யலாம்.',
    honest: 'Voiz of Aram செய்யாதவை', honestList: ['நாங்கள் வாக்காளர் பட்டியலை விற்பதில்லை. உங்களுக்கு உரிமையுள்ள பட்டியலை நீங்கள் கொண்டு வருகிறீர்கள்; அதைப் பயன்படுத்த நாங்கள் உதவுகிறோம்.', 'உங்கள் ஒப்புதல் இல்லாமல் செய்திகளை அனுப்புவதில்லை. ஒவ்வொரு செய்தியும் நடத்தை விதிகள் மற்றும் DLT விதிகளுக்காகச் சரிபார்க்கப்படும்.', 'விலையை மறைப்பதில்லை. செலுத்தும் முன் GST உட்பட முழுத் தொகையும் தெரியும்.'],
    also: 'இவையும் உண்டு', alsoList: [['பிரிவுகள் & தொடர்பு', 'சாவடி 12-இன் முதல்முறை வாக்காளர்கள், 60 வயதுக்கு மேற்பட்ட பெண்கள்: பட்டியலை உருவாக்கி, செலவைப் பார்த்து, SMS, வாட்ஸ்அப் அல்லது குரல் அழைப்பில் அனுப்புங்கள்.'], ['குழுப் பலகை', 'சாவடி வாரியான பணிகள், முகவர்களுக்கு ஒதுக்கீடு.'], ['சாவடி அறிக்கை', 'குழுக் கூட்டத்துக்கு ஒரு பக்க அச்சு அறிக்கை.'], ['தணிக்கைப் பதிவு', 'இறக்குமதி, ஏற்றுமதி, கட்டணம் அனைத்தும் DPDP சட்டத்துக்காகப் பதிவு செய்யப்படும்.']],
    priceT: 'சாவடி எண்ணிக்கைப்படி ஒரே முறை கட்டணம்.', priceD: 'பிரச்சாரம் முழுவதற்கும் ஒரே கட்டணம். பின்னர் சாவடிகளைச் சேர்க்கலாம்.',
    faqT: 'எங்களிடம் கேட்கப்படும் கேள்விகள்',
    faq: [
      ['வாக்காளர் தரவு எங்கிருந்து வருகிறது?', 'நீங்கள் பதிவேற்றும் வாக்காளர் பட்டியலிலிருந்து. வேட்பாளர்கள் வாக்காளர் பதிவு அலுவலரிடமிருந்து சான்றளிக்கப்பட்ட நகல்களைப் பெறுகிறார்கள். பட்டியலைப் பதிவேற்றும் வரை, மாதிரித் தரவு காட்டப்படும்.'],
      ['படிப்பது எவ்வளவு துல்லியமானது?', 'டிஜிட்டல் PDF-கள் துல்லியமாகப் படிக்கப்படும். ஸ்கேன் பக்கங்கள் உங்கள் சாதனத்திலேயே OCR மூலம் படிக்கப்படும். வயது, வீட்டு எண், பாலினம் கிட்டத்தட்ட எப்போதும் சரியாக வரும்; தமிழ்ப் பெயர்களில் சில எழுத்துகளைத் திருத்த வேண்டியிருக்கலாம். சேமிக்கும் முன் எப்போதும் சரிபார்க்கலாம்.'],
      ['எந்தத் தேர்தல்களுக்கு?', 'சட்டமன்றத் தொகுதிகள் மற்றும் கிராம, நகர்ப்புற உள்ளாட்சித் தேர்தல்கள்.'],
      ['சாவடி முகவர்களுக்குக் கணக்கு தேவையா?', 'இல்லை. குழுப் பக்கத்திலிருந்து ஒவ்வொருவருக்கும் தனி இணைப்பை அனுப்புங்கள். 60 நாட்கள் இயங்கும்; நீக்கியதும் நின்றுவிடும்.'],
      ['இது சட்டப்படி சரியா?', 'வாக்காளர் பட்டியல் வேட்பாளர்களின் பயன்பாட்டுக்கான பொது ஆவணம். உங்கள் பிரச்சாரத்துக்கு மட்டுமே பயன்படுத்த வேண்டும், DPDP சட்டம் 2023-ஐப் பின்பற்ற வேண்டும்.'],
      ['பணம் திரும்பக் கிடைக்குமா?', 'செலுத்திய ஒரு வேலை நாளுக்குள் திட்டம் செயல்படாவிட்டால் முழுத் தொகையும் திருப்பித் தரப்படும்.'],
    ],
    endT: 'பட்டியல் பொதுவானது. அதைக் கொண்டு நீங்கள் செய்வதுதான் பிரச்சாரம்.', endD: 'இரண்டு நிமிடங்களில் சாவடிகளை அமைத்து, இன்றிரவே ஒரு பாகத்தை ஏற்றிப் பாருங்கள்.',
    credits: 'Voiz of Aram · Public Voice. Real Action. புகைப்படங்கள் Pexels: Alen J (சென்னை), Roman Saienko (தஞ்சாவூர்), Renjith Tomy Pkm (பொள்ளாச்சி), Ahila devi Manoharan, Subbu Rayan (மதுரை). செயலித் திரைப்படங்கள் மாதிரித் தரவைக் காட்டுகின்றன.',
  },
};

export function useDemo() {
  const nav = useNavigate();
  const toast = useToast();
  return async () => {
    try {
      const s = await api('/auth/demo', { method: 'POST' });
      session.set(s);
      nav('/app');
    } catch (e) { toast(e.message); }
  };
}

export default function Landing() {
  const { t, lang } = useI18n();
  const c = COPY[lang] || COPY.en;
  const openDemo = useDemo();
  const [tiers, setTiers] = useState(FALLBACK_TIERS);
  const [booths, setBooths] = useState(12);

  useEffect(() => {
    api('/public/track', { method: 'POST', body: { kind: 'landing_view' } }).catch(() => {});
    api('/public/meta').then((m) => setTiers(m.tiers)).catch(() => {});
  }, []);

  const tier = useMemo(() => tiers.find((x) => x.maxBooths == null || booths <= x.maxBooths), [tiers, booths]);
  const total = Math.round(tier.base * (1 + GST / 100));

  return (
    <div className="mkt">
      <a href="#main" className="skip">Skip to content</a>
      <SiteHeader>
        <a className="lnk" href="#how">{t('nav_features')}</a>
        <a className="lnk" href="#pricing">{t('nav_pricing')}</a>
        <a className="lnk" href="#faq">{t('nav_faq')}</a>
        <Link className="btn btn-ghost btn-sm" to="/login">{t('nav_signin')}</Link>
        <Link className="btn btn-primary btn-sm" to="/register">{t('nav_register')}</Link>
      </SiteHeader>

      <main id="main">
        <section className="photo-hero">
          <img src={asset('/images/hero-campaign.jpg')} alt="Campaign coordinator with smartphone greeting a smiling family at their doorstep in Tamil Nadu during golden hour" fetchpriority="high" />
          <div className="photo-hero-shade" />
          <div className="container photo-hero-inner">
            <p className="eyebrow">{c.eyebrow}</p>
            <h1 className="display">{c.title}</h1>
            <p className="lead">{c.lead}</p>
            <div className="row" style={{ marginTop: 26 }}>
              <Link className="btn btn-accent" to="/register">{c.cta}</Link>
              <button className="btn btn-on-dark" onClick={openDemo}>{c.demo}</button>
            </div>
            <p className="small" style={{ marginTop: 14, opacity: 0.85 }}>{c.note}</p>
          </div>
        </section>

        <section className="facts" aria-label="Tamil Nadu in numbers">
          <div className="container facts-grid">
            {c.facts.map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}
          </div>
        </section>

        <div id="how">
          <Story k={c.s1k} title={c.s1t} body={c.s1d} bullets={c.s1b}
            media={<figure className="shot shot-wide"><img src={asset('/images/app-import.jpg')} alt="Sethu import screen: a table of voters read from an electoral roll page, ready for review" loading="lazy" /></figure>} />

          <Story flip k={c.s2k} title={c.s2t} body={c.s2d} bullets={c.s2b}
            media={(
              <div className="duo">
                <img className="duo-photo" src={asset('/images/neighbours-thanjavur.jpg')} alt="Neighbours talking on the steps of a house in Thanjavur" loading="lazy" />
                <figure className="phone"><img src={asset('/images/app-capture-phone.jpg')} alt="Field capture on a phone: a photographed voter ID card with name and EPIC number filled in" loading="lazy" /></figure>
              </div>
            )} />

          <Story k={c.s3k} title={c.s3t} body={c.s3d}
            media={<figure className="shot shot-wide"><img src={asset('/images/app-booths.jpg')} alt="Booth strength map of Mylapore, booths coloured by support level" loading="lazy" /></figure>} />

          <Story flip k={c.s4k} title={c.s4t} body={c.s4d}
            media={(
              <div className="duo duo-b">
                <img className="duo-photo" src={asset('/images/women-madurai.jpg')} alt="Three women laying out appalam to dry at a small food unit in Madurai" loading="lazy" />
                <figure className="shot shot-float"><img src={asset('/images/app-voter.jpg')} alt="Voter detail panel with sentiment, notes and the household on the same roll" loading="lazy" /></figure>
              </div>
            )} />
        </div>

        <section className="section">
          <div className="container split-2">
            <div className="honest">
              <h2 className="display-sm">{c.honest}</h2>
              <ul>{c.honestList.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h2 className="display-sm">{c.also}</h2>
              <dl className="also">{c.alsoList.map(([h, d]) => <div key={h}><dt>{h}</dt><dd>{d}</dd></div>)}</dl>
            </div>
          </div>
        </section>

        <section id="pricing" className="section section-alt">
          <div className="container">
            <div className="section-head">
              <h2 className="display-sm">{c.priceT}</h2>
              <p className="muted">{c.priceD}</p>
            </div>
            <div className="card pad calc">
              <div>
                <label className="field">
                  <span className="lbl">{t('price_calc')} <b style={{ color: 'var(--brand)' }}>{booths}</b></span>
                  <input type="range" min="1" max="300" value={booths} onChange={(e) => setBooths(Number(e.target.value))} aria-valuetext={`${booths} booths`} />
                </label>
                <div className="tiers" style={{ marginTop: 18 }}>
                  {tiers.map((x) => (
                    <button key={x.id} type="button" className={`tier${x.id === tier.id ? ' on' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setBooths(x.maxBooths || 200)}>
                      <span className="small muted">{x.label}</span>
                      <b>{inr(x.base)}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="muted small">{tier.label}</div>
                <div className="big-price">{inr(total)}</div>
                <div className="muted small">{t('price_total')} · {inr(Math.round(tier.base / booths))} {t('price_per')}</div>
                <Link className="btn btn-primary btn-block" style={{ marginTop: 16 }} to="/register">{c.cta}</Link>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="section">
          <div className="container" style={{ maxWidth: 820 }}>
            <h2 className="display-sm" style={{ marginBottom: 18 }}>{c.faqT}</h2>
            {c.faq.map(([q, a]) => (
              <details key={q} className="faq"><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </section>

        <section className="end-band">
          <img src={asset('/images/street-madurai.jpg')} alt="" loading="lazy" />
          <div className="end-band-shade" />
          <div className="container end-band-inner">
            <h2 className="display-sm">{c.endT}</h2>
            <p>{c.endD}</p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
              <Link className="btn btn-accent" to="/register">{c.cta}</Link>
              <button className="btn btn-on-dark" onClick={openDemo}>{c.demo}</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="container stack">
          <div className="row between">
            <span>© 2026 Voiz of Aram · Chennai. {t('footer_note')}</span>
            <span className="row"><Link to="/login">{t('nav_signin')}</Link><Link to="/register">{t('nav_register')}</Link></span>
          </div>
          <p className="small" style={{ margin: 0 }}>{c.credits}</p>
        </div>
      </footer>
    </div>
  );
}

function Story({ k, title, body, bullets, media, flip }) {
  return (
    <section className={`story${flip ? ' flip' : ''}`}>
      <div className="container story-grid">
        <div className="story-text">
          <span className="story-k">{k}</span>
          <h2 className="display-sm">{title}</h2>
          <p>{body}</p>
          {bullets && <ul className="ticks">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
        </div>
        <div className="story-media">{media}</div>
      </div>
    </section>
  );
}
