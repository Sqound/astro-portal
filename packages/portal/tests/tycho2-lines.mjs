// Synthetic Tycho-2 records: the ReadMe's fixed columns, invented stars.
function put(line, from, to, value) {
  const text = value === null ? "" : String(value);
  const width = to - from + 1;
  return (
    line.slice(0, from - 1) +
    text.padStart(width).slice(-width) +
    line.slice(to)
  );
}

export function tycho2MainLine({ ra, dec, bt, vt, observed = false }) {
  let line = " ".repeat(206);
  line = put(line, 14, 14, observed ? "X" : " ");
  if (observed) {
    line = put(line, 153, 164, ra.toFixed(8));
    line = put(line, 166, 177, dec.toFixed(8));
  } else {
    line = put(line, 16, 27, ra.toFixed(8));
    line = put(line, 29, 40, dec.toFixed(8));
  }
  line = put(line, 111, 116, bt === null ? null : bt.toFixed(3));
  line = put(line, 124, 129, vt === null ? null : vt.toFixed(3));
  return line;
}

export function tycho2SupplementLine({ ra, dec, bt, vt }) {
  let line = " ".repeat(122);
  line = put(line, 16, 27, ra.toFixed(8));
  line = put(line, 29, 40, dec.toFixed(8));
  line = put(line, 84, 89, bt === null ? null : bt.toFixed(3));
  line = put(line, 97, 102, vt === null ? null : vt.toFixed(3));
  return line;
}
