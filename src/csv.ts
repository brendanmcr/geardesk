// Small RFC 4180 CSV implementation: quoted fields, embedded commas,
// quotes ("" escaping), and newlines inside quotes. No streaming — this
// is for inventory-sized files, and it is tested to destruction in
// test/csv.test.ts rather than assumed correct.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      pushRow();
      i += 2;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // trailing field/row (file may not end with a newline)
  if (field !== "" || row.length > 0) pushRow();
  if (inQuotes) throw new Error("unterminated quoted field");
  return rows;
}

export function serializeCsv(rows: string[][]): string {
  const escape = (v: string) =>
    /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
  return rows.map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}
