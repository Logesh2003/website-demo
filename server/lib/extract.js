// Image → structured voter data using Claude vision.
// Used for (1) electoral-roll pages and (2) field photos of EPIC cards / voter slips.
// If Claude isn't configured, the client falls back to in-browser Tesseract OCR and
// sends plain text, which server/lib/rollParse.js turns into the same shape.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.SETHU_EXTRACT_MODEL || 'claude-opus-5-5';
let client = null;
export function setExtractClient(c) { client = c; } // tests inject a mock
const getClient = () => (client ??= new Anthropic());

export const claudeEnabled = () =>
  process.env.SETHU_EXTRACT_ENGINE === 'claude' ||
  (process.env.SETHU_EXTRACT_ENGINE !== 'ocr' && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || client));

const str = { type: 'string' };
const int = { type: 'integer' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const VOTER = obj({
  serial: { ...int, description: 'Serial number printed in the box; 0 if unreadable' },
  epic: { ...str, description: 'EPIC / voter ID number, usually 3 letters + 7 digits; empty if unreadable' },
  name: { ...str, description: 'Voter name in English letters (transliterate Tamil)' },
  nameTamil: { ...str, description: 'Name exactly as printed in Tamil script; empty if the roll is English-only' },
  relationType: { type: 'string', enum: ['Father', 'Husband', 'Mother', 'Other', ''] },
  relationName: { ...str, description: 'Relative name in English letters' },
  houseNo: str,
  age: { ...int, description: '0 if unreadable' },
  gender: { type: 'string', enum: ['M', 'F', 'T', ''] },
  deleted: { type: 'boolean', description: 'true if the entry is struck through or stamped DELETED' },
});

export const ROLL_SCHEMA = obj({
  pageType: { type: 'string', enum: ['voter_list', 'cover', 'summary', 'other'] },
  header: obj({ assemblyNo: str, assemblyName: str, partNo: str, pollingStation: str, sectionName: str }),
  voters: { type: 'array', items: VOTER },
});

export const CARD_SCHEMA = obj({
  documentType: { type: 'string', enum: ['epic_card', 'voter_slip', 'paper_form', 'other'] },
  epic: str, name: str, nameTamil: str,
  relationType: { type: 'string', enum: ['Father', 'Husband', 'Mother', 'Other', ''] },
  relationName: str,
  gender: { type: 'string', enum: ['M', 'F', 'T', ''] },
  age: { ...int, description: 'Age in years, computed from date of birth if only DOB is shown; 0 if unknown' },
  houseNo: str, address: str, partNo: str, serial: int, mobile: { ...str, description: '10-digit mobile only if handwritten/printed on a form; else empty' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
});

const ROLL_SYSTEM = `You transcribe pages of Indian electoral rolls (Tamil Nadu, published by the Election Commission) into structured data.
Rules:
- Each voter appears in a box with a serial number, an EPIC number, name, relative's name (Father/Husband/Mother/Other), house number, age and gender. Labels may be in Tamil (பெயர், தந்தையின் பெயர், கணவர் பெயர், தாயின் பெயர், வீட்டு எண், வயது, பாலினம்: ஆண்/பெண்/மூன்றாம் பாலினம்) or English.
- Read every box on the page, left to right, top to bottom. Do not skip, merge or invent voters.
- Copy EPIC numbers exactly. If a character is unreadable, leave the field empty rather than guessing.
- Give names in English letters (simple transliteration) in "name"/"relationName"; keep the original Tamil spelling in "nameTamil".
- Cover pages and summary pages have no voter boxes: set pageType accordingly, fill the header, and return an empty voters list.`;

const CARD_SYSTEM = `You read photos taken in the field by election campaign volunteers: EPIC (voter ID) cards, official voter information slips, or handwritten paper forms.
Extract the fields. Copy the EPIC number exactly; leave a field empty if it is not visible or not readable. Never guess digits.
Give names in English letters in "name"/"relationName", and the Tamil spelling in "nameTamil" if shown.
Set confidence to "low" if the photo is blurry, cropped, or the EPIC number is uncertain.`;

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('Send a JPEG, PNG or WebP image.'), { status: 422, code: 'BAD_IMAGE' });
  if (m[2].length > 7_000_000) throw Object.assign(new Error('Image too large. Keep it under 5 MB.'), { status: 413, code: 'IMAGE_TOO_LARGE' });
  return { media_type: m[1], data: m[2] };
}

async function callClaude(system, schema, image, instruction) {
  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if a safety classifier declines, the API retries on a suitable model
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', ...image } }, { type: 'text', text: instruction }] }],
    });
    if (response.stop_reason === 'refusal') throw Object.assign(new Error('The image could not be processed. Try a clearer photo or use manual entry.'), { status: 422, code: 'EXTRACT_REFUSED' });
    if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('This page has too much text to read in one go. Try a tighter crop.'), { status: 422, code: 'EXTRACT_TRUNCATED' });
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) throw Object.assign(new Error('No data returned from the image.'), { status: 502, code: 'EXTRACT_EMPTY' });
    return { data: JSON.parse(text), model: response.model, usage: response.usage };
  } catch (e) {
    if (e.code) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('Image reading is not configured (Claude API key invalid). Use offline OCR.'), { status: 503, code: 'EXTRACT_NOT_CONFIGURED' });
    if (e instanceof Anthropic.RateLimitError) throw Object.assign(new Error('Image reading is busy. Please retry in a minute.'), { status: 429, code: 'EXTRACT_RATE_LIMITED' });
    if (e instanceof Anthropic.BadRequestError) throw Object.assign(new Error('The image could not be read. Try a different photo.'), { status: 422, code: 'EXTRACT_BAD_REQUEST' });
    if (e instanceof Anthropic.APIError) throw Object.assign(new Error('Image reading failed. Please retry.'), { status: 502, code: 'EXTRACT_UPSTREAM' });
    throw Object.assign(new Error('Image reading failed. Please retry.'), { status: 502, code: 'EXTRACT_FAILED' });
  }
}

export async function extractRollPage(dataUrl) {
  const { data, model } = await callClaude(ROLL_SYSTEM, ROLL_SCHEMA, parseDataUrl(dataUrl), 'Transcribe this electoral roll page.');
  return { ...data, voters: data.voters.map(normaliseVoter), engine: 'claude', model };
}

export async function extractCard(dataUrl) {
  const { data, model } = await callClaude(CARD_SYSTEM, CARD_SCHEMA, parseDataUrl(dataUrl), 'Extract the voter details from this photo.');
  return { ...normaliseVoter(data), documentType: data.documentType, address: data.address, partNo: data.partNo, mobile: /^[6-9]\d{9}$/.test(data.mobile) ? data.mobile : '', confidence: data.confidence, engine: 'claude', model };
}

export function normaliseVoter(v) {
  const epic = String(v.epic || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
  const age = Number(v.age) || 0;
  return {
    serial: Number(v.serial) || 0,
    epic,
    epicValid: /^[A-Z]{3}\d{7}$/.test(epic) || /^[A-Z]{2}\/\d{2}\/\d{3}\/\d{6}$/.test(epic),
    name: String(v.name || '').trim(),
    nameTamil: String(v.nameTamil || '').trim(),
    relationType: ['Father', 'Husband', 'Mother', 'Other'].includes(v.relationType) ? v.relationType : '',
    relationName: String(v.relationName || '').trim(),
    houseNo: String(v.houseNo || '').trim(),
    age: age >= 18 && age <= 120 ? age : 0,
    gender: ['M', 'F', 'T'].includes(v.gender) ? v.gender : '',
    deleted: !!v.deleted,
  };
}
