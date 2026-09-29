// Deleted sections (edits.removed) on top of the trim, for export.
// Times here are in the TRIMMED timeline (0 = trim start), in seconds.
// - target 'video' | 'both': the section is cut out of the export (frames, cursor, clicks and audio),
//   matching preview playback, which skips these ranges.
// - target 'audio': the video stays; the voice is muted over that range.

const EPS = 1e-6;

function merge(ranges) {
  const out = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + EPS) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** `removed` in recording seconds → cut/mute ranges in trimmed seconds, clipped to [0, duration]. */
export function cutPlan(removed = [], trimStart = 0, duration) {
  const clip = r => ({ start: Math.max(0, r.start - trimStart), end: Math.min(duration, r.end - trimStart) });
  const valid = r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end - r.start > EPS;
  const cuts = merge(removed.filter(r => r.target !== 'audio').map(clip).filter(valid));
  const kept = [];
  let at = 0;
  for (const c of cuts) { if (c.start - at > EPS) kept.push({ start: at, end: c.start }); at = Math.max(at, c.end); }
  if (duration - at > EPS) kept.push({ start: at, end: duration });
  let offset = 0;
  const segments = kept.map(k => { const s = { ...k, out: offset }; offset += k.end - k.start; return s; });
  const outDuration = offset;
  const toOutput = t => { const s = segments.find(g => t >= g.start - EPS && t < g.end - EPS); return s ? s.out + (t - s.start) : null; };
  const toTrimmed = o => {
    for (const s of segments) if (o < s.out + (s.end - s.start) - EPS) return s.start + Math.max(0, o - s.out);
    const last = segments[segments.length - 1];
    return last ? last.end : 0;
  };
  // Muted ranges in OUTPUT seconds (audio-only deletions that survive the cuts).
  const mutes = [];
  for (const m of merge(removed.filter(r => r.target === 'audio').map(clip).filter(valid))) {
    for (const s of segments) {
      const a = Math.max(m.start, s.start), b = Math.min(m.end, s.end);
      if (b - a > EPS) mutes.push({ start: s.out + (a - s.start), end: s.out + (b - s.start) });
    }
  }
  return { segments, outDuration, toOutput, toTrimmed, mutes: merge(mutes), hasCuts: cuts.length > 0 };
}

/** Click times (trimmed seconds) → output seconds, dropping clicks inside cut sections. */
export function mapClicks(clicks = [], plan) {
  return clicks.map(plan.toOutput).filter(t => t !== null && t >= 0 && t < plan.outDuration);
}
