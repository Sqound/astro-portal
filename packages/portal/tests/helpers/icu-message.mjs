// A small reader of ICU MessageFormat strings, for the guards that compare a
// translation with its English source: the arguments a message uses
// (`{name}`, the variable of a plural or select) and the branches of each
// plural or select (`=1`, `one`, `few`, `other`, `above`…).

function readMessage(text, start, nested, found) {
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === "}") {
      if (nested) return index;
      index += 1;
      continue;
    }
    if (char !== "{") {
      index += 1;
      continue;
    }
    let cursor = index + 1;
    while (cursor < text.length && text[cursor] !== "," && text[cursor] !== "}")
      cursor += 1;
    const name = text.slice(index + 1, cursor).trim();
    if (!name) throw new Error(`an empty argument at ${index}`);
    found.names.add(name);
    if (text[cursor] === "}") {
      index = cursor + 1;
      continue;
    }
    let typeEnd = cursor + 1;
    while (
      typeEnd < text.length &&
      text[typeEnd] !== "," &&
      text[typeEnd] !== "}"
    )
      typeEnd += 1;
    const type = text.slice(cursor + 1, typeEnd).trim();
    if (text[typeEnd] === "}") {
      index = typeEnd + 1;
      continue;
    }
    if (!["plural", "select", "selectordinal"].includes(type)) {
      let depth = 1;
      typeEnd += 1;
      while (typeEnd < text.length && depth > 0) {
        if (text[typeEnd] === "{") depth += 1;
        if (text[typeEnd] === "}") depth -= 1;
        typeEnd += 1;
      }
      index = typeEnd;
      continue;
    }
    let position = typeEnd + 1;
    const branches = [];
    for (;;) {
      while (position < text.length && /\s/.test(text[position])) position += 1;
      if (text[position] === "}") {
        position += 1;
        break;
      }
      let open = position;
      while (open < text.length && text[open] !== "{" && text[open] !== "}")
        open += 1;
      if (text[open] !== "{") throw new Error("a broken branch list");
      branches.push(text.slice(position, open).trim());
      const end = readMessage(text, open + 1, true, found);
      if (text[end] !== "}") throw new Error("an unclosed branch");
      position = end + 1;
    }
    found.selects.push({ type, branches });
    index = position;
  }
  return index;
}

/** `{ names, selects, error }` of an ICU message: `names` sorted, `error` null when it parses. */
export function readIcu(text) {
  const found = { names: new Set(), selects: [] };
  let error = null;
  try {
    readMessage(String(text), 0, false, found);
  } catch (failure) {
    error = failure.message;
  }
  return { names: [...found.names].sort(), selects: found.selects, error };
}
