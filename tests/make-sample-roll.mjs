// Generates a SAMPLE electoral-roll page (fictional people) in the layout used by
// Tamil Nadu rolls: header + 3 columns × N rows of voter boxes.
// Outputs: tests/fixtures/sample-roll.pdf (has a text layer) and sample-roll.png (image only, for OCR).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = 'tests/fixtures';
fs.mkdirSync(OUT, { recursive: true });
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));

const people = [
  ['Lakshmi R', 'Husband', 'Ramesh K', '12/4', 34, 'Female'], ['Ramesh K', 'Father', 'Kannan', '12/4', 39, 'Male'], ['Selvi M', 'Father', 'Murugan', '15', 19, 'Female'],
  ['Murugan S', 'Father', 'Subbiah', '15', 52, 'Male'], ['Valli M', 'Husband', 'Murugan S', '15', 47, 'Female'], ['Arun P', 'Father', 'Palani', '18', 26, 'Male'],
  ['Kavitha A', 'Husband', 'Arun P', '18', 24, 'Female'], ['Gopal V', 'Father', 'Velu', '21', 68, 'Male'], ['Meena G', 'Husband', 'Gopal V', '21', 63, 'Female'],
  ['Saravanan G', 'Father', 'Gopal V', '21', 37, 'Male'], ['Divya S', 'Father', 'Saravanan G', '21', 18, 'Female'], ['Prakash N', 'Father', 'Natarajan', '24', 44, 'Male'],
  ['Revathi P', 'Husband', 'Prakash N', '24', 41, 'Female'], ['Karthik R', 'Father', 'Rajendran', '27', 29, 'Male'], ['Anitha K', 'Father', 'Kumar', '30', 31, 'Female'],
];
const epic = (i) => `TNS${String(4100200 + i * 37).padStart(7, '0')}`;
const box = (p, i) => `
  <div class="box">
    <div class="top"><span class="sl">${i + 1}</span><span class="epic">${epic(i)}</span></div>
    <div>Name : ${p[0]}</div>
    <div>${p[1]}'s Name: ${p[2]}</div>
    <div>House Number : ${p[3]}</div>
    <div>Age : ${p[4]} Gender : ${p[5]}</div>
    <div class="photo">Photo</div>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #000; width: 760px; }
  .hdr { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 4px; }
  .sec { font-size: 12px; margin-bottom: 10px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-left: 1px solid #000; border-top: 1px solid #000; }
  .box { position: relative; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 70px 6px 8px; font-size: 12.5px; line-height: 1.55; min-height: 104px; }
  .top { display: flex; justify-content: space-between; font-weight: bold; }
  .photo { position: absolute; right: 6px; top: 26px; width: 54px; height: 64px; border: 1px solid #555; font-size: 10px; display: grid; place-items: center; color: #555; }
  .note { font-size: 10px; margin-top: 8px; color: #333; }
</style></head><body>
  <div class="hdr"><span>Assembly Constituency No and Name : 25 - Mylapore</span><span>Part No. : 7</span></div>
  <div class="sec">Section No and Name : 1 - Kutchery Road &nbsp;&nbsp; Polling Station : Corporation Middle School, Kutchery Road</div>
  <div class="grid">${people.map(box).join('')}</div>
  <div class="note">SAMPLE DOCUMENT FOR SOFTWARE TESTING. All names and numbers are fictional.</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 820, height: 1100 }, deviceScaleFactor: 2 });
await page.setContent(html);
await page.pdf({ path: `${OUT}/sample-roll.pdf`, width: '820px', height: '900px', printBackground: true });
await page.screenshot({ path: `${OUT}/sample-roll.png`, fullPage: true });
// Tamil-script version of the same page (most Tamil Nadu rolls are printed in Tamil).
const ta = [
  ['லட்சுமி ர', 'கணவர்', 'ரமேஷ் க', '12/4', 34, 'பெண்'], ['ரமேஷ் க', 'தந்தையின்', 'கண்ணன்', '12/4', 39, 'ஆண்'], ['செல்வி மு', 'தந்தையின்', 'முருகன்', '15', 19, 'பெண்'],
  ['முருகன் சு', 'தந்தையின்', 'சுப்பையா', '15', 52, 'ஆண்'], ['வள்ளி மு', 'கணவர்', 'முருகன் சு', '15', 47, 'பெண்'], ['அருண் ப', 'தந்தையின்', 'பழனி', '18', 26, 'ஆண்'],
  ['கவிதா அ', 'கணவர்', 'அருண் ப', '18', 24, 'பெண்'], ['கோபால் வே', 'தந்தையின்', 'வேலு', '21', 68, 'ஆண்'], ['மீனா கோ', 'கணவர்', 'கோபால் வே', '21', 63, 'பெண்'],
  ['சரவணன் கோ', 'தந்தையின்', 'கோபால் வே', '21', 37, 'ஆண்'], ['திவ்யா ச', 'தந்தையின்', 'சரவணன் கோ', '21', 18, 'பெண்'], ['பிரகாஷ் ந', 'தந்தையின்', 'நடராஜன்', '24', 44, 'ஆண்'],
  ['ரேவதி பி', 'கணவர்', 'பிரகாஷ் ந', '24', 41, 'பெண்'], ['கார்த்திக் ரா', 'தந்தையின்', 'ராஜேந்திரன்', '27', 29, 'ஆண்'], ['அனிதா கு', 'தந்தையின்', 'குமார்', '30', 31, 'பெண்'],
];
const taBox = (p, i) => `
  <div class="box">
    <div class="top"><span class="sl">${i + 1}</span><span class="epic">${epic(i + 40)}</span></div>
    <div>பெயர் : ${p[0]}</div>
    <div>${p[1] === 'கணவர்' ? 'கணவர் பெயர்' : 'தந்தையின் பெயர்'} : ${p[2]}</div>
    <div>வீட்டு எண் : ${p[3]}</div>
    <div>வயது : ${p[4]} பாலினம் : ${p[5]}</div>
    <div class="photo">புகைப்படம்</div>
  </div>`;
const taHtml = html
  .replace('Assembly Constituency No and Name : 25 - Mylapore', 'சட்டமன்றத் தொகுதி எண் மற்றும் பெயர் : 25 - மயிலாப்பூர்')
  .replace('Part No. : 7', 'பாகம் எண் : 7')
  .replace('Section No and Name : 1 - Kutchery Road &nbsp;&nbsp; Polling Station : Corporation Middle School, Kutchery Road', 'பிரிவு : 1 - கச்சேரி சாலை &nbsp;&nbsp; வாக்குச்சாவடி : மாநகராட்சி நடுநிலைப் பள்ளி, கச்சேரி சாலை')
  .replace(/<div class="grid">[\s\S]*?<\/div>\s*<div class="note">/, `<div class="grid">${ta.map(taBox).join('')}</div>\n  <div class="note">`)
  .replace('font-family: Arial, sans-serif;', "font-family: 'Nirmala UI', 'Latha', 'Noto Sans Tamil', Arial, sans-serif;");
await page.setContent(taHtml);
await page.screenshot({ path: `${OUT}/sample-roll-ta.png`, fullPage: true });
fs.writeFileSync(`${OUT}/sample-roll-ta.expected.json`, JSON.stringify(ta.map((p, i) => ({ serial: i + 1, epic: epic(i + 40), nameTamil: p[0], relationType: p[1] === 'கணவர்' ? 'Husband' : 'Father', houseNo: p[3], age: p[4], gender: p[5] === 'பெண்' ? 'F' : 'M' })), null, 1));

// A plain voter-card style photo for the field-capture test (fictional person, no emblems).
const card = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
await card.setContent(`<!doctype html><html><body style="margin:0;background:#cfcabc;display:grid;place-items:center;height:400px;font-family:Arial">
  <div style="width:560px;background:#fff;border-radius:10px;padding:18px 22px;box-shadow:0 6px 20px rgba(0,0,0,.25);transform:rotate(-1.2deg)">
    <div style="font-weight:bold;font-size:15px;border-bottom:1px solid #999;padding-bottom:6px">IDENTITY CARD (SAMPLE - NOT A REAL ID)</div>
    <div style="display:flex;gap:18px;margin-top:12px">
      <div style="width:90px;height:110px;border:1px solid #888;display:grid;place-items:center;color:#777;font-size:11px">photo</div>
      <div style="font-size:16px;line-height:1.75">
        <div style="font-weight:bold;letter-spacing:1px">TNS4100200</div>
        <div>Name : Lakshmi R</div>
        <div>Husband's Name : Ramesh K</div>
        <div>Gender : Female</div>
        <div>Date of Birth : 14/03/1992</div>
      </div>
    </div>
  </div></body></html>`);
await card.screenshot({ path: `${OUT}/sample-card.jpg`, type: 'jpeg', quality: 85 });
await browser.close();
console.log('wrote', `${OUT}/sample-roll.pdf`, `${OUT}/sample-roll.png`, `${OUT}/sample-card.jpg`);
