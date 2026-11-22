// Synthetic electoral-roll generator. NO real personal data is used anywhere.
import { rng, pick, between } from './rand.js';
import { boothsFor } from '../data/geo.js';

const MALE = ['Murugan', 'Senthil', 'Karthik', 'Arun', 'Vignesh', 'Suresh', 'Ramesh', 'Prakash', 'Saravanan', 'Manikandan', 'Rajesh', 'Balaji', 'Ganesh', 'Dinesh', 'Selvam', 'Kumar', 'Ravi', 'Gopal', 'Mohan', 'Anand', 'Sathish', 'Vel', 'Ilango', 'Kathir', 'Muthu', 'Pandian', 'Siva', 'Venkatesh', 'Ashok', 'Elango'];
const FEMALE = ['Lakshmi', 'Meena', 'Kavitha', 'Priya', 'Divya', 'Revathi', 'Selvi', 'Malathi', 'Anitha', 'Gayathri', 'Saranya', 'Deepa', 'Vasuki', 'Kalaivani', 'Jothi', 'Nandhini', 'Pavithra', 'Sumathi', 'Valli', 'Indira', 'Thenmozhi', 'Yamuna', 'Bhuvana', 'Shanthi', 'Amudha', 'Kanmani', 'Rani', 'Sangeetha', 'Uma', 'Mahalakshmi'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

const cache = new Map();
const CACHE_MAX = 400;

/** Returns the synthetic voter roll for one booth (deterministic). */
export function votersForBooth(assemblyId, boothNo) {
  const key = `${assemblyId}-${boothNo}`;
  if (cache.has(key)) return cache.get(key);
  const booth = boothsFor(assemblyId).find((b) => b.no === Number(boothNo));
  if (!booth) return [];
  const r = rng(`voters:${key}`);
  const prefix = LETTERS[assemblyId % LETTERS.length] + LETTERS[(assemblyId * 7) % LETTERS.length] + LETTERS[boothNo % LETTERS.length];
  const out = [];
  let house = 1;
  let serial = 1;
  const sections = between(r, 2, 5);
  while (out.length < booth.voters) {
    const familySize = between(r, 1, 6);
    const surnameFather = pick(r, MALE);
    const section = Math.min(sections, 1 + Math.floor((out.length / booth.voters) * sections));
    for (let f = 0; f < familySize && out.length < booth.voters; f++) {
      const g = r();
      const gender = g < 0.003 ? 'T' : g < 0.505 ? 'F' : 'M';
      const ageRoll = r();
      const age = ageRoll < 0.06 ? between(r, 18, 19) : ageRoll < 0.4 ? between(r, 20, 35) : ageRoll < 0.78 ? between(r, 36, 59) : between(r, 60, 92);
      const first = gender === 'F' ? pick(r, FEMALE) : pick(r, MALE);
      const relType = gender === 'F' && age > 24 && r() > 0.45 ? 'Husband' : 'Father';
      out.push({
        id: `${key}-${serial}`,
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
        mobile: r() < 0.42 ? `9${String(between(r, 100000000, 999999999))}` : null,
        assemblyId: Number(assemblyId),
        boothNo: Number(boothNo),
      });
      serial++;
    }
    house += between(r, 1, 3);
  }
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

export function maskVoter(v) {
  return {
    ...v,
    name: v.name[0] + '•••• ' + v.name.split(' ').pop(),
    relationName: v.relationName[0] + '••••',
    epic: v.epic.slice(0, 3) + '•••••' + v.epic.slice(-2),
    mobile: null,
    masked: true,
  };
}

export function ageBand(age) {
  if (age <= 19) return '18-19';
  if (age <= 29) return '20-29';
  if (age <= 39) return '30-39';
  if (age <= 49) return '40-49';
  if (age <= 59) return '50-59';
  if (age <= 69) return '60-69';
  return '70+';
}
export const AGE_BANDS = ['18-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70+'];
