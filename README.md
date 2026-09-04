# geardesk

Inventory management for small operations — a case study in boring software done well.

![CI](https://github.com/brendanmcr/geardesk/actions/workflows/ci.yml/badge.svg) · 13 tests, run against both storage adapters (Postgres via CI service container) · TypeScript strict + `noUncheckedIndexedAccess`

## The case study

Small resale/repair operations track gear in spreadsheets until the spreadsheet lies. GearDesk is the minimal honest replacement: a typed inventory API where money is integer cents, deletes never destroy, and the CSV door swings both ways.

Decisions worth reading the code for:

- **One validator, two doors.** `validateItemInput` guards both the JSON API and the CSV importer, so a rule added once holds everywhere. Imports report per-line errors (`{ line, errors }`) instead of failing the whole file.
- **Delete is archive.** Inventory is a ledger; `DELETE /api/items/:id` sets `status=archived` and nothing is ever destroyed.
- **Merge-then-validate updates.** `PUT` accepts a partial body, merges over the existing item, and validates the *result* — partial updates can't sneak an invalid state in.
- **Hand-rolled RFC 4180 CSV** (~60 lines), tested against quoted commas, escaped quotes, embedded newlines, CRLF, and unterminated quotes. Export → import round-trips losslessly, and there's a test proving it.
- **Contract-tested storage.** Memory and Postgres adapters implement one interface; the same suite runs against both.

## API

`GET/POST /api/items` · `GET/PUT/DELETE /api/items/:id` · `GET /api/summary` · `GET /api/items.csv` · `POST /api/items/import` (text/csv) · `GET /healthz`

Filters: `?status=`, `?category=`, `?q=` (name/serial/notes substring).

## Run it

```sh
npm ci
npm test
npm start                     # in-memory, port 3000

# with Postgres
export DATABASE_URL=postgres://user:pass@localhost:5432/geardesk
npm run migrate && npm start
```

## Status

v0.1.0 — API core. No auth: designed for local/trusted-network use; auth and a browser UI are on the roadmap.

## License

MIT
