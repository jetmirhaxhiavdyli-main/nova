// Old projects may not contain capture cadence. Never claim that an assumed
// 60 fps matches such a recording; manual output rates remain available.
export function sourcePresets(presets, fps) {
  return presets.flatMap(p => p.id !== 'native' ? [p] :
    [24,30,50,60].includes(fps) ? [{...p,fps:String(fps)}] : []);
}
