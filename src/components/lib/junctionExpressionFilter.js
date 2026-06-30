// Shared between JunctionExpressionHeatmap and GeneModelGtex so both only
// show junctions that are part of the reference annotation, have meaningful
// read support, and reach a configurable min CPM in some group -- otherwise
// lowly-expressed/novel junctions clutter both views.
export const MIN_TOTAL_READS = 10;
export const MIN_MEDIAN_CPM = 0.5;

export function selectExpressedJunctionIds(data, { getValue = (d) => d?.median ?? 0, minValue = MIN_MEDIAN_CPM } = {}) {
  const totalReadsByJunction = new Map();
  data.forEach((d) => {
    totalReadsByJunction.set(d.junctionId, (totalReadsByJunction.get(d.junctionId) ?? 0) + (d.total_reads ?? 0));
  });

  const maxValueByJunction = new Map();
  data.forEach((d) => {
    if (!d.annotated || totalReadsByJunction.get(d.junctionId) <= MIN_TOTAL_READS) return;
    const prevMax = maxValueByJunction.get(d.junctionId) ?? 0;
    maxValueByJunction.set(d.junctionId, Math.max(prevMax, getValue(d)));
  });

  return new Set(
    Array.from(maxValueByJunction.entries())
      .filter(([, max]) => max >= minValue)
      .map(([id]) => id)
  );
}

// Single source of truth for the Median/Mean toggle's underlying field, so
// JunctionExpressionHeatmap's cell coloring and GeneModelGtex's junction
// filtering can't drift apart.
export function metricValueGetter(metric) {
  return metric === "mean" ? (d) => d?.mean_cpm ?? 0 : (d) => d?.median ?? 0;
}

// Maps a raw tissueSiteDetailId to the key used in a `hiddenGroups` Set --
// evo-devo rollup/child ids collapse onto one `evo:<region>:<phase>` key so
// hiding a bucket from Configure Samples hides the rollup and all its
// children together, regardless of the rollup's own expand/collapse state.
// Mirrors the two regexes JunctionExpressionHeatmap's buildGroupOrder uses
// to recognize evo-devo ids.
function evoDevoPhase(timepoint) {
  return timepoint.includes("Week Post Conception") ? "Prenatal" : "Postnatal";
}

export function hideKeyFor(id) {
  const childMatch = id.match(/^(Forebrain|Hindbrain)-(.+)$/);
  if (childMatch) {
    const [, region, timepoint] = childMatch;
    return `evo:${region}:${evoDevoPhase(timepoint)}`;
  }
  const rollupMatch = id.match(/^(Forebrain|Hindbrain) \((Prenatal|Postnatal)\) \(Evo-devo\)$/);
  if (rollupMatch) {
    const [, region, phase] = rollupMatch;
    return `evo:${region}:${phase}`;
  }
  return id;
}

export function isGroupHidden(id, hiddenGroups) {
  return hiddenGroups.has(hideKeyFor(id));
}

export function filterHiddenGroups(data, hiddenGroups) {
  if (!hiddenGroups || hiddenGroups.size === 0) return data;
  return data.filter((d) => !isGroupHidden(d.tissueSiteDetailId, hiddenGroups));
}
