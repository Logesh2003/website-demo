export const GST_RATE = 18;

// Our own tiering: transparent per-booth slabs + a whole-constituency plan.
export const TIERS = [
  { id: 'single', maxBooths: 1, base: 1500, label: 'Single booth' },
  { id: 'ward', maxBooths: 5, base: 4500, label: 'Ward pack (up to 5)' },
  { id: 'cluster', maxBooths: 15, base: 11000, label: 'Cluster (up to 15)' },
  { id: 'block', maxBooths: 40, base: 24000, label: 'Block (up to 40)' },
  { id: 'zone', maxBooths: 120, base: 45000, label: 'Zone (up to 120)' },
  { id: 'constituency', maxBooths: Infinity, base: 75000, label: 'Whole constituency' },
];

export const BROADCAST_RATES = { sms: 0.25, whatsapp: 0.85, voice: 0.6 }; // ₹ per recipient

export function quote(boothCount) {
  const n = Math.max(1, parseInt(boothCount, 10) || 1);
  const tier = TIERS.find((t) => n <= t.maxBooths);
  const gst = Math.round((tier.base * GST_RATE) / 100);
  const next = TIERS[TIERS.indexOf(tier) + 1];
  return {
    boothCount: n,
    tier: tier.id,
    label: tier.label,
    base: tier.base,
    gst,
    total: tier.base + gst,
    perBooth: Math.round(tier.base / n),
    nextTier: next ? { label: next.label, atBooths: tier.maxBooths + 1 } : null,
  };
}

export function broadcastCost(channel, audience) {
  const rate = BROADCAST_RATES[channel];
  if (rate == null) return null;
  const base = +(rate * audience).toFixed(2);
  const gst = +((base * GST_RATE) / 100).toFixed(2);
  return { rate, base, gst, total: +(base + gst).toFixed(2) };
}
