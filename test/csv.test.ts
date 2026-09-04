import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, serializeCsv } from "../src/csv.ts";

test("parses simple rows", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,2,3\n"), [["a", "b", "c"], ["1", "2", "3"]]);
});

test("handles CRLF and missing trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("quoted fields with commas, quotes, and newlines", () => {
  const text = 'name,notes\n"Fender, Jazz","He said ""mint""\nreally"\n';
  assert.deepEqual(parseCsv(text), [
    ["name", "notes"],
    ["Fender, Jazz", 'He said "mint"\nreally'],
  ]);
});

test("empty fields survive", () => {
  assert.deepEqual(parseCsv("a,,c\n,,\n"), [["a", "", "c"], ["", "", ""]]);
});

test("unterminated quote throws", () => {
  assert.throws(() => parseCsv('a,"unclosed\n'));
});

test("serialize round-trips through parse", () => {
  const rows = [
    ["name", "notes"],
    ["Fender, Jazz", 'said "mint"'],
    ["plain", "multi\nline"],
  ];
  assert.deepEqual(parseCsv(serializeCsv(rows)), rows);
});

test("serialize leaves clean values unquoted", () => {
  assert.equal(serializeCsv([["a", "b"]]), "a,b\r\n");
});
