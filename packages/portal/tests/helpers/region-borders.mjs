/**
 * Geometry checks for the regional calibration table: rings that are simple
 * and closed, and neighbouring regions that share their border vertices, so
 * the border leaves neither a gap nor an overlap. Rings are the table's own:
 * arrays of `[latitude, longitude]`, closed implicitly (the first vertex is
 * not repeated at the end). Everything is plain planar geometry in degrees:
 * the rings are small enough, and the edges short enough, for that to be what
 * the table's own point-in-polygon test does too.
 */
const same = (first, second) =>
  first[0] === second[0] && first[1] === second[1];

export const edgesOf = (ring) =>
  ring.map((vertex, index) => [vertex, ring[(index + 1) % ring.length]]);

const cross = (origin, first, second) =>
  (first[1] - origin[1]) * (second[0] - origin[0]) -
  (first[0] - origin[0]) * (second[1] - origin[1]);

/** Distance in degrees from a point to a segment, and whether it is exact. */
function distanceToEdge(point, [start, end]) {
  const dLat = end[0] - start[0];
  const dLon = end[1] - start[1];
  const length = dLat * dLat + dLon * dLon;
  const along = length
    ? Math.max(
        0,
        Math.min(
          1,
          ((point[0] - start[0]) * dLat + (point[1] - start[1]) * dLon) /
            length,
        ),
      )
    : 0;
  const nearest = [start[0] + along * dLat, start[1] + along * dLon];
  return {
    distance: Math.hypot(point[0] - nearest[0], point[1] - nearest[1]),
    onEdge: cross(start, end, point) === 0 && along > 0 && along < 1,
  };
}

/** Do two segments cross at a point interior to both? (touching is not crossing) */
function properlyCross([a, b], [c, d]) {
  const first = Math.sign(cross(a, b, c));
  const second = Math.sign(cross(a, b, d));
  const third = Math.sign(cross(c, d, a));
  const fourth = Math.sign(cross(c, d, b));
  return first * second < 0 && third * fourth < 0;
}

export function ringProblems(ring) {
  const problems = [];
  if (!Array.isArray(ring) || ring.length < 3) return ["fewer than 3 vertices"];
  for (const [latitude, longitude] of ring)
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      problems.push(`impossible vertex ${latitude},${longitude}`);
  if (same(ring[0], ring[ring.length - 1]))
    problems.push(
      "the first vertex is repeated at the end (rings close implicitly)",
    );
  for (let index = 0; index < ring.length; index += 1)
    if (same(ring[index], ring[(index + 1) % ring.length]))
      problems.push(`duplicate consecutive vertex at ${index}`);
  const edges = edgesOf(ring);
  for (let first = 0; first < edges.length; first += 1)
    for (let second = first + 1; second < edges.length; second += 1) {
      const adjacent =
        second === first + 1 || (first === 0 && second === edges.length - 1);
      if (!adjacent && properlyCross(edges[first], edges[second]))
        problems.push(`edges ${first} and ${second} cross`);
    }
  let area = 0;
  for (const [start, end] of edges)
    area += start[1] * end[0] - end[1] * start[0];
  if (area === 0) problems.push("zero area");
  return problems;
}

/**
 * Problems between the rings of two DIFFERENT regions, and the edges they
 * share. A shared edge is the same two vertices in either direction. What
 * would make a gap or an overlap: edges that cross, a vertex strictly inside
 * the other region's edge (a T-junction: the border is not the same chain on
 * both sides), a vertex a hair away from the other's edge without being on
 * it (a sliver), or a ring inside the other. `tolerance` is the sliver width
 * in degrees.
 */
export function borderProblems(ringA, ringB, inside, tolerance = 0.05) {
  const problems = [];
  const shared = [];
  const edgesA = edgesOf(ringA);
  const edgesB = edgesOf(ringB);
  for (const edgeA of edgesA)
    for (const edgeB of edgesB) {
      if (
        (same(edgeA[0], edgeB[0]) && same(edgeA[1], edgeB[1])) ||
        (same(edgeA[0], edgeB[1]) && same(edgeA[1], edgeB[0]))
      )
        shared.push(edgeA);
      else if (properlyCross(edgeA, edgeB))
        problems.push(`edges ${edgeA.join("→")} and ${edgeB.join("→")} cross`);
    }
  const probe = (from, to, label) => {
    for (const vertex of from) {
      if (to.some((other) => same(other, vertex))) continue;
      for (const edge of edgesOf(to)) {
        const { distance, onEdge } = distanceToEdge(vertex, edge);
        if (onEdge)
          problems.push(
            `${label} vertex ${vertex} lies inside an edge of the other ring (not a shared vertex)`,
          );
        else if (distance > 0 && distance < tolerance)
          problems.push(
            `${label} vertex ${vertex} is ${distance.toFixed(4)}° from the other ring's edge: a sliver, not a shared border`,
          );
      }
    }
  };
  probe(ringA, ringB, "first");
  probe(ringB, ringA, "second");
  const strictlyInside = (vertices, ring) =>
    vertices.some(
      (vertex) =>
        inside(vertex[0], vertex[1], [ring]) &&
        !ring.some((other) => same(other, vertex)) &&
        !edgesOf(ring).some(
          (edge) => distanceToEdge(vertex, edge).distance === 0,
        ),
    );
  if (strictlyInside(ringA, ringB))
    problems.push("a vertex of the first ring is inside the second");
  if (strictlyInside(ringB, ringA))
    problems.push("a vertex of the second ring is inside the first");
  return { problems, shared };
}

/** Every problem of a region table, plus its shared borders by region pair. */
export function tableBorderProblems(regions, inside) {
  const problems = [];
  const borders = [];
  regions.forEach((region) =>
    region.polygons.forEach((ring, index) =>
      ringProblems(ring).forEach((problem) =>
        problems.push(`${region.id} ring ${index}: ${problem}`),
      ),
    ),
  );
  for (let first = 0; first < regions.length; first += 1)
    for (let second = first + 1; second < regions.length; second += 1)
      for (const ringA of regions[first].polygons)
        for (const ringB of regions[second].polygons) {
          const result = borderProblems(ringA, ringB, inside);
          result.problems.forEach((problem) =>
            problems.push(
              `${regions[first].id} / ${regions[second].id}: ${problem}`,
            ),
          );
          if (result.shared.length)
            borders.push({
              edges: result.shared,
              first: regions[first].id,
              second: regions[second].id,
            });
        }
  return { borders, problems };
}
