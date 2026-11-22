import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const DICT = {
  en: {
    brand: 'Voiz of Aram', tagline: 'Public Voice. Real Action.',
    nav_features: 'Features', nav_pricing: 'Pricing', nav_faq: 'FAQ', nav_signin: 'Sign in', nav_register: 'Get started',
    hero_kicker: 'For Tamil Nadu candidates & campaign teams',
    hero_title: 'Know every booth. Reach every voter.',
    hero_sub: 'Voiz of Aram turns the electoral roll into a working campaign plan: booth strength maps, voter tagging, family view, outreach in Tamil and English, and a team board for your booth agents.',
    hero_cta: 'Create free account', hero_demo: 'Explore the live demo', hero_note: 'Free preview of your booth statistics. Pay only when you unlock voter names.',
    stat_booths: 'polling booths covered', stat_lang: 'languages, switch anytime', stat_setup: 'minute sign-up',
    feat_title: 'Everything a booth-level campaign needs', feat_sub: 'Built for the way Tamil Nadu campaigns actually run — on phones, on WhatsApp, in two languages.',
    f1_t: 'Booth strength map', f1_d: 'Every booth on a map, coloured by how strong your support is, so you know where to send people today.',
    f2_t: 'Voter tagging & family view', f2_d: 'Mark supporters, leaners and neutrals. See whole households together and plan one visit, not five.',
    f3_t: 'Segmented outreach', f3_d: 'Build an audience — first-time voters in booth 12, women over 60 — and send SMS, WhatsApp or a voice call with a live cost estimate.',
    f4_t: 'Booth agent board', f4_d: 'Add volunteers, assign booths, track door-to-door tasks from to-do to done.',
    f5_t: 'Printable booth reports', f5_d: 'One-page report per booth with age and gender profile, ready for your booth committee meeting.',
    f6_t: 'DPDP-ready by design', f6_d: 'Consent captured at sign-up, exports logged in an audit trail, voter names masked until your plan is active.',
    how_title: 'From sign-up to your first booth plan in minutes',
    how1: 'Verify your WhatsApp number with a one-time code', how2: 'Pick your constituency and booths — see the price as you go', how3: 'Explore free booth statistics instantly', how4: 'Pay by UPI to unlock names, tagging and outreach',
    price_title: 'Simple pricing by booth count', price_sub: 'One payment for the campaign. GST shown upfront. Add booths later — you only move up when you cross a slab.',
    price_calc: 'How many booths?', price_total: 'Total incl. GST', price_per: 'per booth',
    faq_title: 'Questions candidates ask',
    q1: 'Which elections is Voiz of Aram for?', a1: 'Tamil Nadu Assembly constituencies and rural and urban local body elections (panchayat, municipality, corporation wards).',
    q2: 'What do I get before paying?', a2: 'Booth list, map, voter counts, gender and age breakdowns for your chosen booths. Names, search, tagging, export and outreach unlock after payment.',
    q3: 'How fast is my plan activated?', a3: 'Pay by UPI and enter the 12-digit UTR. Our team verifies within working hours, usually within an hour. With gateway payments it is instant.',
    q4: 'Is it legal to use voter data?', a4: 'Electoral rolls are published by the Election Commission. Voiz of Aram helps you use them responsibly under the DPDP Act 2023: campaign outreach only, never resale, every export logged.',
    q5: 'Can I add booths later?', a5: 'Yes. Add booths from your workspace; the price only changes when you cross into the next slab.',
    q6: 'Is there a refund?', a6: 'If your plan is not active within one working day of payment, you get a full refund.',
    cta_title: 'Your booths are waiting.', cta_sub: 'Set up your campaign workspace in under two minutes.',
    footer_note: 'Independent software. Not affiliated with the Election Commission of India or any political party.',
    // register
    reg_title: 'Create your campaign account', reg_sub: 'Four short steps. Your progress is saved on this device.',
    reg_have: 'Already have an account?', step_verify: 'Verify', step_role: 'Role', step_area: 'Constituency', step_finish: 'Finish',
    full_name: 'Full name', full_name_ph: 'As on your voter ID', mobile: 'WhatsApp number', mobile_ph: '10-digit mobile number',
    send_code: 'Send code', resend: 'Resend code', otp: 'Verification code', otp_ph: '6-digit code', verify: 'Verify', verified: 'Verified',
    code_sent: 'Code sent to', change_number: 'Change number', dev_code: 'Dev mode — your code is',
    your_role: 'Your role', role_planning: 'Planning to contest', role_confirmed: 'Confirmed candidate', role_team: 'Campaign team member', role_functionary: 'Party functionary',
    affiliation: 'Political affiliation', aff_party: 'Party candidate', aff_independent: 'Independent', party: 'Party', select: 'Select…',
    election: 'Which election?', el_assembly: 'Assembly', el_assembly_d: 'MLA constituency', el_rural: 'Rural local body', el_rural_d: 'Panchayat, union, district panchayat', el_urban: 'Urban local body', el_urban_d: 'Town panchayat, municipality, corporation',
    position: 'Position', local_body: 'Local body name', ward: 'Ward no.', district: 'District', assembly: 'Assembly constituency', choose_district: 'Choose a district first',
    booths: 'Booths', search_booths: 'Search booth number, school or street', select_all: 'Select all shown', clear: 'Clear', selected: 'selected',
    your_price: 'Your plan', review: 'Review', passcode: 'Create a passcode', passcode_hint: '6+ characters, letters and numbers. You sign in with your mobile and this passcode.',
    consent: 'I will use voter data only for my campaign’s outreach, will not sell or share it, and agree to the Terms and Privacy Policy (DPDP Act 2023).',
    back: 'Back', next: 'Continue', create: 'Create account', creating: 'Creating…',
    done_title: 'Your workspace is ready', done_sub: 'Your free booth statistics are live. Unlock names, tagging and outreach whenever you are ready.', open_ws: 'Open my workspace', pay_now: 'Unlock full plan',
    // login
    login_title: 'Welcome back', login_sub: 'Sign in with your mobile number.', with_passcode: 'Passcode', with_otp: 'One-time code', sign_in: 'Sign in', forgot: 'Forgot passcode?', new_here: 'New to Voiz of Aram?', create_acc: 'Create an account', try_demo: 'Try the demo',
    new_passcode: 'New passcode', reset: 'Reset passcode',
  },
  ta: {
    brand: 'Voiz of Aram', tagline: 'Public Voice. Real Action.',
    nav_features: 'அம்சங்கள்', nav_pricing: 'கட்டணம்', nav_faq: 'கேள்விகள்', nav_signin: 'உள்நுழைக', nav_register: 'தொடங்குக',
    hero_kicker: 'தமிழ்நாடு வேட்பாளர்கள் மற்றும் பிரச்சாரக் குழுக்களுக்கு',
    hero_title: 'ஒவ்வொரு வாக்குச்சாவடியையும் அறிக. ஒவ்வொரு வாக்காளரையும் அடைக.',
    hero_sub: 'வாக்காளர் பட்டியலை செயல்படும் பிரச்சாரத் திட்டமாக மாற்றுகிறது Voiz of Aram: சாவடி வலிமை வரைபடம், வாக்காளர் குறியிடல், குடும்பக் காட்சி, தமிழ் மற்றும் ஆங்கிலத்தில் தொடர்பு, சாவடி முகவர்களுக்கான பணிப் பலகை.',
    hero_cta: 'இலவசக் கணக்கு உருவாக்குக', hero_demo: 'நேரடி டெமோவைப் பாருங்கள்', hero_note: 'உங்கள் சாவடி புள்ளிவிவரங்கள் இலவசம். வாக்காளர் பெயர்களைத் திறக்கும்போது மட்டும் கட்டணம்.',
    stat_booths: 'வாக்குச்சாவடிகள்', stat_lang: 'மொழிகள், எப்போதும் மாற்றலாம்', stat_setup: 'நிமிடப் பதிவு',
    feat_title: 'சாவடி அளவிலான பிரச்சாரத்துக்குத் தேவையான அனைத்தும்', feat_sub: 'தமிழ்நாட்டுப் பிரச்சாரங்கள் உண்மையில் நடக்கும் விதத்துக்காக — கைபேசியில், வாட்ஸ்அப்பில், இரு மொழிகளில்.',
    f1_t: 'சாவடி வலிமை வரைபடம்', f1_d: 'ஒவ்வொரு சாவடியும் வரைபடத்தில், உங்கள் ஆதரவின் வலிமைக்கேற்ப வண்ணத்தில் — இன்று எங்கு ஆட்களை அனுப்ப வேண்டும் என அறியலாம்.',
    f2_t: 'வாக்காளர் குறியிடல் & குடும்பக் காட்சி', f2_d: 'ஆதரவாளர், சாய்வுடையவர், நடுநிலையாளர் எனக் குறியிடுங்கள். முழுக் குடும்பத்தையும் ஒன்றாகப் பார்த்து ஒரே வருகையில் சந்தியுங்கள்.',
    f3_t: 'பிரிவு வாரியான தொடர்பு', f3_d: 'பார்வையாளர் குழுவை உருவாக்குங்கள் — சாவடி 12-இன் முதல்முறை வாக்காளர்கள், 60 வயதுக்கு மேற்பட்ட பெண்கள் — SMS, வாட்ஸ்அப், குரல் அழைப்பு, உடனடி செலவு மதிப்பீட்டுடன்.',
    f4_t: 'சாவடி முகவர் பலகை', f4_d: 'தன்னார்வலர்களைச் சேர்த்து, சாவடிகளை ஒதுக்கி, வீடு வீடாகச் செல்லும் பணிகளைக் கண்காணியுங்கள்.',
    f5_t: 'அச்சிடக்கூடிய சாவடி அறிக்கை', f5_d: 'ஒவ்வொரு சாவடிக்கும் வயது, பாலின விவரத்துடன் ஒரு பக்க அறிக்கை.',
    f6_t: 'DPDP சட்டத்துக்கு ஏற்ப', f6_d: 'பதிவின்போதே ஒப்புதல், ஒவ்வொரு ஏற்றுமதியும் தணிக்கைப் பதிவில், திட்டம் செயல்படும் வரை பெயர்கள் மறைக்கப்படும்.',
    how_title: 'பதிவு முதல் முதல் சாவடித் திட்டம் வரை சில நிமிடங்களில்',
    how1: 'உங்கள் வாட்ஸ்அப் எண்ணை ஒருமுறைக் குறியீட்டால் சரிபாருங்கள்', how2: 'தொகுதியையும் சாவடிகளையும் தேர்ந்தெடுங்கள் — கட்டணம் உடனே தெரியும்', how3: 'இலவச சாவடி புள்ளிவிவரங்களை உடனே பாருங்கள்', how4: 'UPI மூலம் செலுத்தி பெயர்கள், குறியிடல், தொடர்பு வசதிகளைத் திறங்கள்',
    price_title: 'சாவடி எண்ணிக்கைப்படி எளிய கட்டணம்', price_sub: 'பிரச்சாரத்துக்கு ஒரே கட்டணம். GST முன்கூட்டியே காட்டப்படும். பின்னர் சாவடிகளைச் சேர்க்கலாம்.',
    price_calc: 'எத்தனை சாவடிகள்?', price_total: 'GST உட்பட மொத்தம்', price_per: 'ஒரு சாவடிக்கு',
    faq_title: 'வேட்பாளர்கள் கேட்கும் கேள்விகள்',
    q1: 'Voiz of Aram எந்தத் தேர்தல்களுக்கு?', a1: 'தமிழ்நாடு சட்டமன்றத் தொகுதிகள் மற்றும் கிராம, நகர்ப்புற உள்ளாட்சித் தேர்தல்கள் (ஊராட்சி, நகராட்சி, மாநகராட்சி வார்டுகள்).',
    q2: 'கட்டணம் செலுத்தும் முன் என்ன கிடைக்கும்?', a2: 'சாவடிப் பட்டியல், வரைபடம், வாக்காளர் எண்ணிக்கை, பாலின மற்றும் வயது விவரம். பெயர்கள், தேடல், குறியிடல், ஏற்றுமதி, தொடர்பு ஆகியவை கட்டணத்துக்குப் பின்.',
    q3: 'திட்டம் எவ்வளவு விரைவில் செயல்படும்?', a3: 'UPI மூலம் செலுத்தி 12 இலக்க UTR எண்ணை உள்ளிடுங்கள். வேலை நேரத்தில், பொதுவாக ஒரு மணி நேரத்துக்குள் சரிபார்க்கப்படும்.',
    q4: 'வாக்காளர் தரவைப் பயன்படுத்துவது சட்டப்படி சரியா?', a4: 'வாக்காளர் பட்டியல் தேர்தல் ஆணையத்தால் வெளியிடப்படுகிறது. DPDP சட்டம் 2023-இன்படி பொறுப்புடன் பயன்படுத்த Voiz of Aram உதவுகிறது: பிரச்சாரத் தொடர்புக்கு மட்டும், ஒவ்வொரு ஏற்றுமதியும் பதிவு செய்யப்படும்.',
    q5: 'பின்னர் சாவடிகளைச் சேர்க்கலாமா?', a5: 'ஆம். அடுத்த அடுக்கைக் கடக்கும்போது மட்டுமே கட்டணம் மாறும்.',
    q6: 'பணம் திரும்பக் கிடைக்குமா?', a6: 'செலுத்திய ஒரு வேலை நாளுக்குள் திட்டம் செயல்படாவிட்டால், முழுத் தொகையும் திருப்பித் தரப்படும்.',
    cta_title: 'உங்கள் சாவடிகள் காத்திருக்கின்றன.', cta_sub: 'இரண்டு நிமிடங்களுக்குள் உங்கள் பிரச்சாரப் பணியிடத்தை அமையுங்கள்.',
    footer_note: 'சுதந்திரமான மென்பொருள். இந்தியத் தேர்தல் ஆணையம் அல்லது எந்த அரசியல் கட்சியுடனும் தொடர்புடையதல்ல.',
    reg_title: 'உங்கள் பிரச்சாரக் கணக்கை உருவாக்குங்கள்', reg_sub: 'நான்கு சிறிய படிகள். உங்கள் முன்னேற்றம் இந்தச் சாதனத்தில் சேமிக்கப்படும்.',
    reg_have: 'ஏற்கனவே கணக்கு உள்ளதா?', step_verify: 'சரிபார்ப்பு', step_role: 'பங்கு', step_area: 'தொகுதி', step_finish: 'நிறைவு',
    full_name: 'முழுப் பெயர்', full_name_ph: 'வாக்காளர் அடையாள அட்டைப்படி', mobile: 'வாட்ஸ்அப் எண்', mobile_ph: '10 இலக்கக் கைபேசி எண்',
    send_code: 'குறியீடு அனுப்பு', resend: 'மீண்டும் அனுப்பு', otp: 'சரிபார்ப்புக் குறியீடு', otp_ph: '6 இலக்கக் குறியீடு', verify: 'சரிபார்', verified: 'சரிபார்க்கப்பட்டது',
    code_sent: 'குறியீடு அனுப்பப்பட்டது', change_number: 'எண்ணை மாற்று', dev_code: 'டெவ் பயன்முறை — உங்கள் குறியீடு',
    your_role: 'உங்கள் பங்கு', role_planning: 'போட்டியிடத் திட்டமிடுகிறேன்', role_confirmed: 'உறுதிசெய்யப்பட்ட வேட்பாளர்', role_team: 'பிரச்சாரக் குழு உறுப்பினர்', role_functionary: 'கட்சி நிர்வாகி',
    affiliation: 'அரசியல் சார்பு', aff_party: 'கட்சி வேட்பாளர்', aff_independent: 'சுயேச்சை', party: 'கட்சி', select: 'தேர்ந்தெடுக்கவும்…',
    election: 'எந்தத் தேர்தல்?', el_assembly: 'சட்டமன்றம்', el_assembly_d: 'சட்டமன்றத் தொகுதி', el_rural: 'கிராமப்புற உள்ளாட்சி', el_rural_d: 'ஊராட்சி, ஒன்றியம், மாவட்ட ஊராட்சி', el_urban: 'நகர்ப்புற உள்ளாட்சி', el_urban_d: 'பேரூராட்சி, நகராட்சி, மாநகராட்சி',
    position: 'பதவி', local_body: 'உள்ளாட்சி அமைப்பின் பெயர்', ward: 'வார்டு எண்', district: 'மாவட்டம்', assembly: 'சட்டமன்றத் தொகுதி', choose_district: 'முதலில் மாவட்டத்தைத் தேர்ந்தெடுக்கவும்',
    booths: 'சாவடிகள்', search_booths: 'சாவடி எண், பள்ளி அல்லது தெருவைத் தேடுக', select_all: 'காட்டப்பட்டவை அனைத்தும்', clear: 'அழி', selected: 'தேர்ந்தெடுக்கப்பட்டது',
    your_price: 'உங்கள் திட்டம்', review: 'சரிபார்', passcode: 'கடவுக்குறியீட்டை உருவாக்குக', passcode_hint: '6+ எழுத்துகள், எழுத்தும் எண்ணும் கலந்து. கைபேசி எண் மற்றும் இந்தக் குறியீட்டால் உள்நுழைவீர்கள்.',
    consent: 'வாக்காளர் தரவை என் பிரச்சாரத் தொடர்புக்கு மட்டுமே பயன்படுத்துவேன், விற்கவோ பகிரவோ மாட்டேன்; விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கையை (DPDP சட்டம் 2023) ஏற்கிறேன்.',
    back: 'பின்செல்', next: 'தொடர்க', create: 'கணக்கை உருவாக்கு', creating: 'உருவாக்குகிறது…',
    done_title: 'உங்கள் பணியிடம் தயார்', done_sub: 'உங்கள் இலவச சாவடி புள்ளிவிவரங்கள் தயாராக உள்ளன. தயாரானதும் முழுத் திட்டத்தைத் திறக்கலாம்.', open_ws: 'பணியிடத்தைத் திற', pay_now: 'முழுத் திட்டத்தைத் திற',
    login_title: 'மீண்டும் வருக', login_sub: 'உங்கள் கைபேசி எண்ணுடன் உள்நுழையுங்கள்.', with_passcode: 'கடவுக்குறியீடு', with_otp: 'ஒருமுறைக் குறியீடு', sign_in: 'உள்நுழைக', forgot: 'கடவுக்குறியீடு மறந்ததா?', new_here: 'சேதுவுக்குப் புதியவரா?', create_acc: 'கணக்கை உருவாக்குக', try_demo: 'டெமோவை முயலுக',
    new_passcode: 'புதிய கடவுக்குறியீடு', reset: 'கடவுக்குறியீட்டை மாற்று',
  },
};

const I18n = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('sethu.lang') || (navigator.language?.startsWith('ta') ? 'ta' : 'en'); } catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('sethu.lang', lang); } catch { /* ignore */ }
  }, [lang]);
  const value = useMemo(() => ({
    lang, setLang, isTa: lang === 'ta',
    t: (k) => DICT[lang][k] ?? DICT.en[k] ?? k,
  }), [lang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);
