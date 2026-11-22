// Parses OCR text (Tesseract, Tamil + English) from electoral-roll pages and EPIC cards.
// OCR is noisy, so every result is shown for human review before it is saved.
import { normaliseVoter } from './extract.js';

const EPIC_RE = /\b([A-Z]{3})\s?[-]?\s?(\d{7})\b/;
// "12 1184101680": a serial number followed by an EPIC whose letters OCR misread as digits.
const SERIAL_LINE = /^\s*(\d{1,4})[\s.)]+[0-9A-Z]{8,12}\s*$/i;
// Tesseract inserts zero-width joiners in Tamil output; they break every label match.
const ZW = /[\u200B-\u200D\uFEFF]/g;
// Labels, English + Tamil. OCR often turns ':' into ';', '.', '-' or drops it. Values may wrap to the next line.
// (Separator between label and value: ':' or what OCR makes of it — ';', '.', '-', or nothing.)
const L = {
  name: /^(?:Name|Elector'?s?\s*Name|பெயர்|வாக்காளர்\s*பெயர்)\s*[:;：.\-]?\s*(.*)$/i,
  father: /^(?:Father'?s?\s*Name|தந்தையின்\s*பெயர்|தந்தை\s*பெயர்)\s*[:;：.\-]?\s*(.*)$/i,
  husband: /^(?:Husband'?s?\s*Name|கணவர்\s*பெயர்|கணவரின்\s*பெயர்)\s*[:;：.\-]?\s*(.*)$/i,
  mother: /^(?:Mother'?s?\s*Name|தாயின்\s*பெயர்|தாய்\s*பெயர்)\s*[:;：.\-]?\s*(.*)$/i,
  other: /^(?:Others?'?s?\s*Name|மற்றவர்\s*பெயர்|இதரர்\s*பெயர்)\s*[:;：.\-]?\s*(.*)$/i,
  house: /(?:House\s*(?:Number|No\.?)|வீட்டு\s*எண்|வீடு\s*எண்)\s*[:;：.\-]?\s*([^\s]+)/i,
  age: /(?:Age|வயது)\s*[:;：.\-]?\s*(\d{2,3})/i,
  gender: /(?:Gender|Sex|பாலினம்)\s*[:;：.\-]?\s*(Male|Female|Third\s*Gender|Transgender|ஆண்|பெண்|மூன்றாம்\s*பாலினம்|திருநங்கை)/i,
  genderBare: /\b(Male|Female)\b|(ஆண்|பெண்)\s*$/i,
  genderLabel: /(?:Gender|Sex|பாலினம்)\s*[:;：.\-]?\s*$/i,
  dob: /(?:DOB|Date\s*of\s*Birth|பிறந்த\s*தேதி)\s*[:;：.\-]?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i,
  part: /(?:Part\s*No\.?|பாகம்\s*எண்)\s*[:;：.\-]?\s*(\d{1,4})/i,
  ac: /(?:Assembly\s*Constituency|சட்டமன்ற)[^:：]*[:;：]\s*(.+)$/i,
  ps: /(?:Polling\s*Station|வாக்குச்சாவடி)[^:：]*[:;：]\s*(.+)$/i,
};
const isLabel = (line) => [L.name, L.father, L.husband, L.mother, L.other].some((r) => r.test(line)) || L.house.test(line) || L.age.test(line) || /பாலினம்|Gender/i.test(line);
const genderOf = (s) => {
  if (!s) return '';
  if (/^(Female|பெண்)/i.test(s)) return 'F';
  if (/^(Male|ஆண்)/i.test(s)) return 'M';
  return 'T';
};
// Noise from the photo box next to each entry: '|', '&', misread "புகைப்படம்"/"Photo", and a lone 'ட'
// (no Tamil word starts with ட, so it is never a real initial).
const junk = (t) => /[|&©®™@]/.test(t) || /^(?:ட|[^\s]{0,2}கைப்ப\S*|Photo\S*|புகைப்படம்\S*|[-–_=~^*.,;:'"]+)$/i.test(t);
const clean = (s) => String(s || '').split(/\s+/).filter((t) => t && !junk(t)).join(' ').replace(/[|_~`"“”]+/g, '').trim();
// Tamil text is kept as-is in nameTamil; English goes to name.
const hasTamil = (s) => /[\u0B80-\u0BFF]/.test(s);

/** Parse the OCR text of one roll page (ideally one column strip at a time, concatenated). */
export function parseRollText(text) {
  const lines = String(text || '').replace(ZW, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = { assemblyNo: '', assemblyName: '', partNo: '', pollingStation: '', sectionName: '' };
  const voters = [];
  let cur = null;
  let pendingEpic = '';
  let pendingSerial = 0;
  let awaiting = null; // field whose value wrapped onto the next line
  const flush = () => { if (cur && (cur.name || cur.nameTamil)) voters.push(normaliseVoter(cur)); cur = null; awaiting = null; };
  const setName = (v) => { cur.name = v; cur.nameTamil = hasTamil(v) ? v : ''; };

  for (const raw of lines) {
    // Box borders often come through as a leading '|', '[' or '!' before the label.
    const line = raw.replace(/[‘’`]/g, "'").replace(/^[|!\[\](){}<>_~*=+]+\s*/, '');
    let m;
    if (!header.partNo && (m = L.part.exec(line))) header.partNo = m[1];
    if (!header.assemblyName && (m = L.ac.exec(line))) { const v = m[1].trim(); const n = /^(\d{1,3})\s*[-–]?\s*(.+)$/.exec(v); header.assemblyNo = n ? n[1] : ''; header.assemblyName = (n ? n[2] : v).split(/\s+(?:Part\s*No|பாகம்)/i)[0].trim(); }
    if (!header.pollingStation && (m = L.ps.exec(line))) header.pollingStation = m[1].trim();

    const epicM = EPIC_RE.exec(line.toUpperCase());
    if (epicM && !L.name.test(line)) {
      // A serial number often sits on the same line as the EPIC, before it.
      const serialM = /^\s*(\d{1,4})[\s.)]+[A-Z]{3}/i.exec(line);
      // Some layouts print the EPIC under the name: attach it to the open entry, unless this line starts a new one.
      if (!serialM && cur && !cur.epic && (cur.name || cur.nameTamil) && !cur._closed) { cur.epic = epicM[1] + epicM[2]; continue; }
      flush();
      pendingEpic = epicM[1] + epicM[2];
      pendingSerial = serialM ? Number(serialM[1]) : 0;
      continue;
    }
    if ((m = SERIAL_LINE.exec(line))) { flush(); pendingEpic = ''; pendingSerial = Number(m[1]); continue; }
    if ((m = L.father.exec(line)) || (m = L.husband.exec(line)) || (m = L.mother.exec(line)) || (m = L.other.exec(line))) {
      if (!cur) cur = { epic: pendingEpic, serial: pendingSerial };
      cur.relationType = L.father.test(line) ? 'Father' : L.husband.test(line) ? 'Husband' : L.mother.test(line) ? 'Mother' : 'Other';
      cur.relationName = clean(m[1]);
      awaiting = 'relationName';
      continue;
    }
    if ((m = L.name.exec(line))) {
      if (cur && (cur.name || cur.nameTamil)) flush();
      cur = { epic: pendingEpic, serial: pendingSerial };
      pendingEpic = ''; pendingSerial = 0;
      // OCR sometimes joins the next label onto the name line: "கார்த்திக் ரா தந்தையின் பெயர் : ..."
      const joined = /(தந்தையின்|தந்தை|கணவர்|கணவரின்|தாயின்|தாய்|Father'?s?|Husband'?s?|Mother'?s?)\s*(பெயர்|Name)\s*[:;：.\-]?\s*(.*)$/i.exec(m[1]);
      if (joined) {
        setName(clean(m[1].slice(0, joined.index)));
        cur.relationType = /தந்தை|Father/i.test(joined[1]) ? 'Father' : /கணவர்|Husband/i.test(joined[1]) ? 'Husband' : 'Mother';
        cur.relationName = clean(joined[3]);
        awaiting = 'relationName';
        continue;
      }
      setName(clean(m[1]));
      awaiting = 'name';
      continue;
    }
    if (!cur) continue;
    // Continuation of a wrapped value: short, not a label.
    if (awaiting && !isLabel(line)) {
      const extra = clean(line);
      if (extra && extra.split(' ').length <= 3 && !/\d{2,}/.test(extra)) {
        if (awaiting === 'name') setName([cur.name, extra].filter(Boolean).join(' '));
        else cur.relationName = [cur.relationName, extra].filter(Boolean).join(' ');
      }
      awaiting = null;
      continue;
    }
    awaiting = null;
    if ((m = L.house.exec(line))) cur.houseNo = m[1].replace(/[^\w/-]/g, '');
    if ((m = L.age.exec(line))) cur.age = Number(m[1]);
    if ((m = L.gender.exec(line)) || (m = L.genderBare.exec(line))) { cur.gender = genderOf(m[1] || m[2]); cur._closed = true; }
    if ((m = L.dob.exec(line)) && !cur.age) cur.age = ageFromDob(m[1], m[2], m[3]);
  }
  flush();
  return { pageType: voters.length ? 'voter_list' : 'other', header, voters, engine: 'ocr' };
}

/** Parse OCR text from an EPIC card / voter slip photo. */
export function parseCardText(text) {
  const { voters } = parseRollText(text);
  const all = String(text || '');
  const v = voters[0] || normaliseVoter({});
  if (!v.epic) { const m = EPIC_RE.exec(all.toUpperCase()); if (m) Object.assign(v, normaliseVoter({ ...v, epic: m[1] + m[2] })); }
  const part = L.part.exec(all);
  const mobile = /\b([6-9]\d{9})\b/.exec(all.replace(/\s+/g, ''));
  return { ...v, documentType: /ELECTION COMMISSION|IDENTITY CARD|அடையாள அட்டை/i.test(all) ? 'epic_card' : /VOTER INFORMATION|SLIP|சீட்டு/i.test(all) ? 'voter_slip' : 'other', partNo: part ? part[1] : '', mobile: mobile ? mobile[1] : '', address: '', confidence: v.epicValid && (v.name || v.nameTamil) ? 'medium' : 'low', engine: 'ocr' };
}

function ageFromDob(d, m, y) {
  const dob = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(dob.getTime())) return 0;
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 864e5));
}
