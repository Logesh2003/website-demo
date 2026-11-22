// Validation shared by server (authoritative) and mirrored on the client.
export const ROLES = ['planning', 'confirmed', 'team', 'functionary'];
export const PARTIES = ['DMK', 'AIADMK', 'BJP', 'INC', 'NTK', 'PMK', 'VCK', 'MDMK', 'AMMK', 'DMDK', 'TVK', 'CPI', 'CPI(M)', 'Other'];
export const ELECTION_TYPES = ['assembly', 'rural', 'urban'];

export const isMobile = (m) => /^[6-9]\d{9}$/.test(String(m || ''));
export const isName = (n) => typeof n === 'string' && n.trim().length >= 3 && n.trim().length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(n.trim());
export const isPasscode = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 64 && /\d/.test(p) && /[A-Za-z]/.test(p);
export const isUtr = (u) => /^\d{12}$/.test(String(u || ''));

export function validateRegistration(b) {
  const errors = {};
  if (!isName(b.fullName)) errors.fullName = 'Enter your full name (3–80 letters).';
  if (!isMobile(b.mobile)) errors.mobile = 'Enter a valid 10-digit Indian mobile number.';
  if (!ROLES.includes(b.role)) errors.role = 'Choose your role.';
  if (!['party', 'independent'].includes(b.affiliation)) errors.affiliation = 'Choose your affiliation.';
  if (b.affiliation === 'party' && !PARTIES.includes(b.party)) errors.party = 'Choose your party.';
  if (!ELECTION_TYPES.includes(b.electionType)) errors.electionType = 'Choose the election.';
  if (!b.assemblyId) errors.assemblyId = 'Choose your constituency.';
  if (b.electionType !== 'assembly') {
    if (!b.position) errors.position = 'Choose the position.';
    if (!b.localBody || String(b.localBody).trim().length < 2) errors.localBody = 'Enter the local body name.';
    if (!/^\d{1,3}$/.test(String(b.wardNumber || ''))) errors.wardNumber = 'Enter the ward number.';
  }
  if (!Array.isArray(b.booths) || b.booths.length === 0) errors.booths = 'Pick at least one booth.';
  if (!isPasscode(b.passcode)) errors.passcode = 'Passcode needs 6+ characters with letters and numbers.';
  if (b.consent !== true) errors.consent = 'Please accept the data-use terms.';
  return errors;
}
