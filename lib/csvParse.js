/** Minimal RFC4180-ish CSV parser for import previews. */
function parseCsv(text, { maxRows = 0 } = {}) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line, i, arr) => line.length > 0 || i < arr.length - 1);

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const rows = [];
  let i = 0;

  function parseRow(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (inQuotes) {
        if (ch === '"') {
          if (line[j + 1] === '"') {
            cur += '"';
            j += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }

  const headers = parseRow(lines[0]);
  i = 1;
  while (i < lines.length) {
    if (maxRows > 0 && rows.length >= maxRows) break;
    rows.push(parseRow(lines[i]));
    i += 1;
  }

  return { headers, rows };
}

module.exports = { parseCsv };
