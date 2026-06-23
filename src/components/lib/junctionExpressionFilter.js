// Shared between JunctionExpressionHeatmap and GeneModelGtex so both only
// show junctions that are part of the reference annotation, have meaningful
// read support, and reach a median CPM of at least MIN_MEDIAN_CPM in some
// group -- otherwise lowly-expressed/novel junctions clutter both views.
export const MIN_TOTAL_READS = 10;
export const MIN_MEDIAN_CPM = 1;

export function selectExpressedJunctionIds(data) {
  const totalReadsByJunction = new Map();
  data.forEach((d) => {
    totalReadsByJunction.set(d.junctionId, (totalReadsByJunction.get(d.junctionId) ?? 0) + (d.total_reads ?? 0));
  });

  const maxMedianByJunction = new Map();
  data.forEach((d) => {
    if (!d.annotated || totalReadsByJunction.get(d.junctionId) <= MIN_TOTAL_READS) return;
    const prevMax = maxMedianByJunction.get(d.junctionId) ?? 0;
    maxMedianByJunction.set(d.junctionId, Math.max(prevMax, d.median ?? 0));
  });

  return new Set(
    Array.from(maxMedianByJunction.entries())
      .filter(([, max]) => max >= MIN_MEDIAN_CPM)
      .map(([id]) => id)
  );
}
