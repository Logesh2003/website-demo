// Client-side mock API handlers for static deployments (e.g. GitHub Pages)
// Allows the entire Voiz of Aram demo dashboard, booth map, voter roll,
// task kanban, and outreach preview to run fully in the browser without a live backend.

export const DEMO_USER = {
  id: 1,
  mobile: '9000000000',
  fullName: 'demo-candidate',
  role: 'confirmed',
  affiliation: 'independent',
  party: null,
  electionType: 'assembly',
  position: null,
  localBody: null,
  wardNumber: null,
  district: 'Chennai',
  assemblyId: 9,
  assemblyName: 'Mylapore',
  booths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  status: 'active',
  isAdmin: false,
  isDemo: true,
  lang: 'en',
  electionDate: '2027-04-15',
  createdAt: '2026-11-20T00:00:00Z',
};

export const TIERS = [
  { id: 'single', maxBooths: 1, base: 1500, label: 'Single booth' },
  { id: 'ward', maxBooths: 5, base: 4500, label: 'Ward pack (up to 5)' },
  { id: 'cluster', maxBooths: 15, base: 11000, label: 'Cluster (up to 15)' },
  { id: 'block', maxBooths: 40, base: 24000, label: 'Block (up to 40)' },
  { id: 'zone', maxBooths: 120, base: 45000, label: 'Zone (up to 120)' },
  { id: 'constituency', maxBooths: Infinity, base: 75000, label: 'Whole constituency' },
];

export const MYLAPORE_BOOTHS = [
  { no: 1, name: "Panchayat Union Primary School, Kamarajar Salai", locality: "Kamarajar Salai", lat: 13.1793, lng: 80.27143, voters: 674 },
  { no: 2, name: "Government High School, Rajaji Street - Room 6", locality: "Rajaji Street", lat: 13.14991, lng: 80.26804, voters: 776 },
  { no: 3, name: "Municipal Elementary School, Kamarajar Salai", locality: "Kamarajar Salai", lat: 13.1609, lng: 80.26294, voters: 1273 },
  { no: 4, name: "Adi Dravidar Welfare School, Vinayagar Koil Street - Room 3", locality: "Vinayagar Koil Street", lat: 13.14674, lng: 80.25449, voters: 677 },
  { no: 5, name: "Aided Middle School, Mariamman Koil Street", locality: "Mariamman Koil Street", lat: 13.16186, lng: 80.26947, voters: 1159 },
  { no: 6, name: "Panchayat Union Primary School, Vinayagar Koil Street - Room 2", locality: "Vinayagar Koil Street", lat: 13.16329, lng: 80.26593, voters: 1145 },
  { no: 7, name: "Corporation Middle School, Kamarajar Salai", locality: "Kamarajar Salai", lat: 13.16692, lng: 80.25271, voters: 820 },
  { no: 8, name: "Adi Dravidar Welfare School, Bharathi Nagar", locality: "Bharathi Nagar", lat: 13.15752, lng: 80.24022, voters: 1372 },
  { no: 9, name: "Corporation Middle School, Station Road", locality: "Station Road", lat: 13.14786, lng: 80.27619, voters: 1383 },
  { no: 10, name: "Government Higher Secondary School, Ambedkar Street", locality: "Ambedkar Street", lat: 13.18112, lng: 80.25733, voters: 1257 },
  { no: 11, name: "Government High School, Bharathi Nagar", locality: "Bharathi Nagar", lat: 13.16762, lng: 80.25636, voters: 896 },
  { no: 12, name: "Municipal Elementary School, VOC Nagar - Room 5", locality: "VOC Nagar", lat: 13.16209, lng: 80.23965, voters: 837 }
];

export const DISTRICTS = [
  { name: 'Chennai', lat: 13.08, lng: 80.27 },
  { name: 'Chengalpattu', lat: 12.69, lng: 79.98 },
  { name: 'Coimbatore', lat: 11.02, lng: 76.96 },
  { name: 'Madurai', lat: 9.93, lng: 78.12 },
  { name: 'Salem', lat: 11.66, lng: 78.15 },
  { name: 'Tiruchirappalli', lat: 10.80, lng: 78.69 },
];

export const AGE_BANDS = ['18-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70+'];

export function ageBand(age) {
  if (age <= 19) return '18-19';
  if (age <= 29) return '20-29';
  if (age <= 39) return '30-39';
  if (age <= 49) return '40-49';
  if (age <= 59) return '50-59';
  if (age <= 69) return '60-69';
  return '70+';
}

export function quote(n = 12) {
  const count = Math.max(1, parseInt(n, 10) || 12);
  const tier = TIERS.find((t) => count <= t.maxBooths) || TIERS[TIERS.length - 1];
  const gst = Math.round((tier.base * 18) / 100);
  const next = TIERS[TIERS.indexOf(tier) + 1];
  return {
    boothCount: count,
    tier: tier.id,
    label: tier.label,
    base: tier.base,
    gst,
    total: tier.base + gst,
    perBooth: Math.round(tier.base / count),
    nextTier: next ? { label: next.label, atBooths: tier.maxBooths + 1 } : null,
  };
}

// PRNG
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, min, max) => min + Math.floor(r() * (max - min + 1));

const MALE = ['Murugan', 'Senthil', 'Karthik', 'Arun', 'Vignesh', 'Suresh', 'Ramesh', 'Prakash', 'Saravanan', 'Manikandan', 'Rajesh', 'Balaji', 'Ganesh', 'Dinesh', 'Selvam', 'Kumar', 'Ravi', 'Gopal', 'Mohan', 'Anand', 'Sathish', 'Vel', 'Ilango', 'Kathir', 'Muthu', 'Pandian', 'Siva', 'Venkatesh', 'Ashok', 'Elango'];
const FEMALE = ['Lakshmi', 'Meena', 'Kavitha', 'Priya', 'Divya', 'Revathi', 'Selvi', 'Malathi', 'Anitha', 'Gayathri', 'Saranya', 'Deepa', 'Vasuki', 'Kalaivani', 'Jothi', 'Nandhini', 'Pavithra', 'Sumathi', 'Valli', 'Indira', 'Thenmozhi', 'Yamuna', 'Bhuvana', 'Shanthi', 'Amudha', 'Kanmani', 'Rani', 'Sangeetha', 'Uma', 'Mahalakshmi'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

const voterCache = new Map();

export function getMockVotersForBooth(boothNo) {
  const b = MYLAPORE_BOOTHS.find((x) => x.no === Number(boothNo));
  if (!b) return [];
  if (voterCache.has(b.no)) return voterCache.get(b.no);
  const r = rng(`mock:voters:9-${b.no}`);
  const prefix = 'TM' + LETTERS[b.no % LETTERS.length];
  const out = [];
  let house = 1;
  let serial = 1;
  const sections = between(r, 2, 4);
  while (out.length < b.voters) {
    const familySize = between(r, 1, 5);
    const surnameFather = pick(r, MALE);
    const section = Math.min(sections, 1 + Math.floor((out.length / b.voters) * sections));
    for (let f = 0; f < familySize && out.length < b.voters; f++) {
      const g = r();
      const gender = g < 0.003 ? 'T' : g < 0.505 ? 'F' : 'M';
      const ageRoll = r();
      const age = ageRoll < 0.06 ? between(r, 18, 19) : ageRoll < 0.4 ? between(r, 20, 35) : ageRoll < 0.78 ? between(r, 36, 59) : between(r, 60, 92);
      const first = gender === 'F' ? pick(r, FEMALE) : pick(r, MALE);
      const relType = gender === 'F' && age > 24 && r() > 0.45 ? 'Husband' : 'Father';
      out.push({
        id: `9-${b.no}-${serial}`,
        serial,
        epic: `${prefix}${String(1000000 + Math.floor(r() * 8999999))}`,
        name: `${first} ${surnameFather[0]}`,
        relation: relType,
        relationName: relType === 'Husband' ? pick(r, MALE) : surnameFather,
        age,
        gender,
        house: `${house}${r() > 0.85 ? '/' + between(r, 1, 4) : ''}`,
        houseKey: String(house),
        section,
        mobile: r() < 0.45 ? `9${String(between(r, 100000000, 999999999))}` : null,
        assemblyId: 9,
        boothNo: b.no,
      });
      serial++;
    }
    house += between(r, 1, 3);
  }
  voterCache.set(b.no, out);
  return out;
}

export function getAllMockVoters() {
  return MYLAPORE_BOOTHS.flatMap((b) => getMockVotersForBooth(b.no));
}

// Storage helpers
const STORAGE_KEY = 'voiz_mock_store';
function getStore() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function saveStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private mode */
  }
}

function initStore() {
  let s = getStore();
  if (s) return s;

  // Build initial deterministic tags for ~15% of voters
  const tags = {};
  const allVoters = getAllMockVoters();
  const r = rng('mock:tags:seed');
  const sentiments = ['supporter', 'supporter', 'leaning', 'neutral', 'opposed'];
  for (const v of allVoters) {
    if (r() < 0.16) {
      const sentiment = pick(r, sentiments);
      tags[v.id] = {
        sentiment,
        note: sentiment === 'supporter' ? 'Strong community supporter' : '',
        contacted: r() < 0.6 ? 1 : 0,
      };
    }
  }

  s = {
    user: { ...DEMO_USER },
    tags,
    volunteers: [
      { id: 1, name: 'Kathir (Booth agent)', mobile: '9876500001', booths: [1, 2, 3, 4] },
      { id: 2, name: 'Revathi (Booth agent)', mobile: '9876500002', booths: [5, 6, 7, 8] },
    ],
    tasks: [
      { id: 1, title: 'Door-to-door: Section 1 first-time voters', booth_no: 1, volunteer_id: 1, status: 'doing', due: null },
      { id: 2, title: 'Verify missing mobile numbers', booth_no: 3, volunteer_id: 1, status: 'todo', due: null },
      { id: 3, title: 'Senior citizens: arrange polling-day transport list', booth_no: 6, volunteer_id: 2, status: 'todo', due: null },
      { id: 4, title: 'Booth committee meeting', booth_no: 7, volunteer_id: 2, status: 'done', due: null },
    ],
    broadcasts: [],
    nextTaskId: 5,
    nextVolId: 3,
  };
  saveStore(s);
  return s;
}

export function handleMockApi(path, { method = 'GET', body, raw } = {}) {
  const store = initStore();
  const url = new URL(path, 'http://localhost');
  const pathname = url.pathname;
  const params = url.searchParams;

  // ---------- /auth/demo ----------
  if (pathname === '/auth/demo' && method === 'POST') {
    return {
      token: 'voiz-mock-demo-token',
      user: store.user,
    };
  }

  // ---------- /public/meta ----------
  if (pathname === '/public/meta') {
    return {
      tiers: TIERS,
      districts: DISTRICTS,
    };
  }

  // ---------- /public/track ----------
  if (pathname === '/public/track') {
    return { ok: true };
  }

  // ---------- /public/assemblies ----------
  if (pathname === '/public/assemblies') {
    return {
      assemblies: [
        { id: 9, name: 'Mylapore', district: 'Chennai', lat: 13.04, lng: 80.26, boothCount: 242 },
        { id: 10, name: 'Velachery', district: 'Chennai', lat: 12.98, lng: 80.22, boothCount: 260 },
        { id: 11, name: 'Anna Nagar', district: 'Chennai', lat: 13.08, lng: 80.21, boothCount: 280 },
      ],
    };
  }

  // ---------- /public/quote ----------
  if (pathname === '/public/quote') {
    return quote(params.get('booths') || 12);
  }

  // ---------- /me ----------
  if (pathname === '/me') {
    if (method === 'PATCH') {
      if (body?.electionDate) store.user.electionDate = body.electionDate;
      if (body?.lang) store.user.lang = body.lang;
      saveStore(store);
    }
    return { user: store.user };
  }

  // ---------- /me/overview ----------
  if (pathname === '/me/overview') {
    const roll = getAllMockVoters();
    const tags = store.tags || {};
    const gender = { M: 0, F: 0, T: 0 };
    const ages = Object.fromEntries(AGE_BANDS.map((b) => [b, { M: 0, F: 0, T: 0 }]));
    const sentiment = { supporter: 0, leaning: 0, neutral: 0, opposed: 0, unknown: 0 };
    let ageSum = 0, withMobile = 0, firstTime = 0, contacted = 0;

    for (const v of roll) {
      gender[v.gender]++;
      ages[ageBand(v.age)][v.gender]++;
      ageSum += v.age;
      if (v.mobile) withMobile++;
      if (v.age <= 19) firstTime++;
      const t = tags[v.id];
      sentiment[t?.sentiment || 'unknown']++;
      if (t?.contacted) contacted++;
    }

    const taskCounts = { todo: 0, doing: 0, done: 0 };
    for (const t of store.tasks) {
      if (taskCounts[t.status] !== undefined) taskCounts[t.status]++;
    }

    return {
      plan: { status: store.user.status, active: true, quote: quote(12) },
      assembly: { id: 9, name: 'Mylapore', district: 'Chennai', lat: 13.04, lng: 80.26, boothCount: 242 },
      totals: {
        booths: 12,
        voters: roll.length,
        withMobile,
        firstTime,
        contacted,
        avgAge: roll.length ? +(ageSum / roll.length).toFixed(1) : 0,
      },
      gender,
      ages,
      sentiment,
      tasks: taskCounts,
      volunteers: store.volunteers.length,
      electionDate: store.user.electionDate,
    };
  }

  // ---------- /me/booths ----------
  if (pathname === '/me/booths') {
    const tags = store.tags || {};
    const booths = MYLAPORE_BOOTHS.map((b) => {
      const roll = getMockVotersForBooth(b.no);
      const s = { supporter: 0, leaning: 0, neutral: 0, opposed: 0 };
      let F = 0, young = 0;
      for (const v of roll) {
        if (v.gender === 'F') F++;
        if (v.age <= 29) young++;
        const sen = tags[v.id]?.sentiment;
        if (sen && s[sen] !== undefined) s[sen]++;
      }
      const tagged = s.supporter + s.leaning + s.neutral + s.opposed;
      const strength = tagged >= roll.length * 0.05
        ? Math.round(((s.supporter + s.leaning * 0.5) / tagged) * 100)
        : null;
      return {
        ...b,
        voters: roll.length,
        female: F,
        male: roll.length - F,
        young,
        sentiment: s,
        tagged,
        coverage: Math.round((tagged / roll.length) * 100),
        strength,
      };
    });
    return { booths, center: { id: 9, name: 'Mylapore', district: 'Chennai', lat: 13.16, lng: 80.26 } };
  }

  // ---------- /me/booths/:no/report ----------
  const boothReportMatch = pathname.match(/^\/me\/booths\/(\d+)\/report$/);
  if (boothReportMatch) {
    const no = Number(boothReportMatch[1]);
    const booth = MYLAPORE_BOOTHS.find((b) => b.no === no);
    if (!booth) throw new Error('Booth not found');
    const roll = getMockVotersForBooth(no);
    const ages = Object.fromEntries(AGE_BANDS.map((b) => [b, 0]));
    const sections = {};
    roll.forEach((v) => {
      ages[ageBand(v.age)]++;
      sections[v.section] = (sections[v.section] || 0) + 1;
    });
    const families = new Set(roll.map((v) => v.houseKey)).size;
    return {
      booth,
      assembly: { id: 9, name: 'Mylapore', district: 'Chennai' },
      voters: roll.length,
      families,
      ages,
      sections,
      gender: {
        M: roll.filter((v) => v.gender === 'M').length,
        F: roll.filter((v) => v.gender === 'F').length,
        T: roll.filter((v) => v.gender === 'T').length,
      },
    };
  }

  // ---------- /me/voters ----------
  if (pathname === '/me/voters') {
    const tags = store.tags || {};
    const qStr = (params.get('q') || '').toLowerCase().trim();
    const boothParam = params.get('booth');
    const genderParam = params.get('gender');
    const sentParam = params.get('sentiment');
    const firstTimeParam = params.get('firstTime') === '1';
    const hasMobileParam = params.get('hasMobile') === '1';
    const page = Math.max(1, Number(params.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize')) || 25));

    let roll = boothParam ? getMockVotersForBooth(Number(boothParam)) : getAllMockVoters();

    if (genderParam) {
      roll = roll.filter((v) => v.gender === genderParam);
    }
    if (firstTimeParam) {
      roll = roll.filter((v) => v.age <= 19);
    }
    if (hasMobileParam) {
      roll = roll.filter((v) => !!v.mobile);
    }
    if (sentParam) {
      roll = roll.filter((v) => {
        const t = tags[v.id]?.sentiment;
        return sentParam === 'unknown' ? !t : t === sentParam;
      });
    }
    if (qStr) {
      roll = roll.filter((v) =>
        v.name.toLowerCase().includes(qStr) ||
        v.epic.toLowerCase().includes(qStr) ||
        v.relationName.toLowerCase().includes(qStr)
      );
    }

    const total = roll.length;
    const slice = roll.slice((page - 1) * pageSize, page * pageSize).map((v) => ({
      ...v,
      tag: tags[v.id] || null,
    }));

    return {
      total,
      page,
      pageSize,
      masked: false,
      voters: slice,
    };
  }

  // ---------- /me/voters/:id/tag (PUT) ----------
  const tagMatch = pathname.match(/^\/me\/voters\/([^/]+)\/tag$/);
  if (tagMatch && method === 'PUT') {
    const voterId = tagMatch[1];
    store.tags = store.tags || {};
    const cur = store.tags[voterId] || {};
    const newTag = {
      sentiment: body?.sentiment !== undefined ? body.sentiment : cur.sentiment || null,
      note: body?.note !== undefined ? body.note : cur.note || '',
      contacted: body?.contacted ? 1 : 0,
    };
    store.tags[voterId] = newTag;
    saveStore(store);
    return { ok: true, tag: newTag };
  }

  // ---------- /me/voters/:id (GET) ----------
  const singleVoterMatch = pathname.match(/^\/me\/voters\/([^/]+)$/);
  if (singleVoterMatch && method === 'GET') {
    const voterId = singleVoterMatch[1];
    const tags = store.tags || {};
    const all = getAllMockVoters();
    const voter = all.find((v) => v.id === voterId);
    if (!voter) throw new Error('Voter not found');
    const family = all
      .filter((x) => x.boothNo === voter.boothNo && x.houseKey === voter.houseKey && x.id !== voter.id)
      .map((x) => ({ ...x, tag: tags[x.id] || null }));
    return {
      voter: { ...voter, tag: tags[voter.id] || null },
      family,
    };
  }

  // ---------- /me/export.csv ----------
  if (pathname === '/me/export.csv') {
    const boothParam = params.get('booth');
    const roll = boothParam ? getMockVotersForBooth(Number(boothParam)) : getAllMockVoters();
    const tags = store.tags || {};
    const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const head = ['Booth', 'Serial', 'EPIC', 'Name', 'Relation', 'Relation name', 'Age', 'Gender', 'House', 'Section', 'Mobile', 'Sentiment'];
    const bodyRows = roll.map((v) =>
      [v.boothNo, v.serial, v.epic, v.name, v.relation, v.relationName, v.age, v.gender, v.house, v.section, v.mobile, tags[v.id]?.sentiment || ''].map(esc).join(',')
    );
    const csvContent = '\uFEFF' + [head.map(esc).join(','), ...bodyRows].join('\n');
    if (raw) {
      return new Response(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }), {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }
    return csvContent;
  }

  // ---------- /me/team ----------
  if (pathname === '/me/team') {
    return {
      volunteers: store.volunteers,
      tasks: store.tasks,
    };
  }

  // ---------- /me/volunteers ----------
  if (pathname === '/me/volunteers' && method === 'POST') {
    const id = store.nextVolId++;
    const v = {
      id,
      name: body.name,
      mobile: body.mobile,
      booths: body.booths || [],
    };
    store.volunteers.push(v);
    saveStore(store);
    return { id };
  }

  // ---------- /me/volunteers/:id (DELETE) ----------
  const delVolMatch = pathname.match(/^\/me\/volunteers\/(\d+)$/);
  if (delVolMatch && method === 'DELETE') {
    const vid = Number(delVolMatch[1]);
    store.volunteers = store.volunteers.filter((v) => v.id !== vid);
    store.tasks.forEach((t) => {
      if (t.volunteer_id === vid) t.volunteer_id = null;
    });
    saveStore(store);
    return { ok: true };
  }

  // ---------- /me/volunteers/:id/link ----------
  if (pathname.match(/^\/me\/volunteers\/(\d+)\/link$/)) {
    return { path: '/field/mock-agent-token' };
  }

  // ---------- /me/tasks ----------
  if (pathname === '/me/tasks' && method === 'POST') {
    const id = store.nextTaskId++;
    const t = {
      id,
      title: body.title,
      booth_no: body.boothNo ? Number(body.boothNo) : null,
      volunteer_id: body.volunteerId ? Number(body.volunteerId) : null,
      status: 'todo',
      due: body.due || null,
    };
    store.tasks.unshift(t);
    saveStore(store);
    return { id };
  }

  // ---------- /me/tasks/:id ----------
  const taskMatch = pathname.match(/^\/me\/tasks\/(\d+)$/);
  if (taskMatch) {
    const tid = Number(taskMatch[1]);
    if (method === 'PATCH') {
      const t = store.tasks.find((x) => x.id === tid);
      if (t && body?.status) t.status = body.status;
      saveStore(store);
      return { ok: true };
    }
    if (method === 'DELETE') {
      store.tasks = store.tasks.filter((x) => x.id !== tid);
      saveStore(store);
      return { ok: true };
    }
  }

  // ---------- /me/billing ----------
  if (pathname === '/me/billing') {
    return {
      status: store.user.status,
      quote: quote(12),
      payments: [
        {
          id: 1,
          ref: 'STU9921',
          booth_count: 12,
          base: 11000,
          gst: 1980,
          total: 12980,
          utr: '987654321012',
          status: 'approved',
          note: 'Verified (Demo)',
          created_at: '2026-11-20 10:00:00',
          reviewed_at: '2026-11-20 10:30:00',
        },
      ],
    };
  }

  // ---------- /me/segments/preview ----------
  if (pathname === '/me/segments/preview') {
    const roll = getAllMockVoters();
    const reachable = roll.filter((v) => v.mobile).length;
    return {
      audience: roll.length,
      reachable,
      costs: {
        sms: { rate: 0.25, base: Math.round(reachable * 0.25), gst: Math.round(reachable * 0.25 * 0.18), total: Math.round(reachable * 0.25 * 1.18) },
        whatsapp: { rate: 0.85, base: Math.round(reachable * 0.85), gst: Math.round(reachable * 0.85 * 0.18), total: Math.round(reachable * 0.85 * 1.18) },
        voice: { rate: 0.6, base: Math.round(reachable * 0.6), gst: Math.round(reachable * 0.6 * 0.18), total: Math.round(reachable * 0.6 * 1.18) },
      },
    };
  }

  // ---------- /me/broadcasts ----------
  if (pathname === '/me/broadcasts') {
    if (method === 'POST') {
      const b = { id: Date.now(), status: 'pending_review', ...body };
      store.broadcasts.push(b);
      saveStore(store);
      return { ok: true, broadcast: b };
    }
    return { broadcasts: store.broadcasts || [] };
  }

  // ---------- /extract/status ----------
  if (pathname === '/extract/status') {
    return { claude: false, synthetic: true, ocr: true };
  }

  // ---------- /agent/me ----------
  if (pathname === '/agent/me') {
    return {
      volunteer: { id: 1, name: 'Kathir', booths: [1, 2, 3, 4] },
      assembly: { id: 9, name: 'Mylapore', district: 'Chennai' },
      booths: MYLAPORE_BOOTHS.slice(0, 4),
    };
  }

  // ---------- Default Fallback ----------
  return { ok: true };
}
