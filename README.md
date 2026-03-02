# MediWard — Orthopedic Ward Manager

A comprehensive ward management system for orthopedic units, built with React 19 + TypeScript + Vite.

## Architecture

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| State | React Context (AppContext) with auto-persistence |
| Persistence | localStorage with versioned envelopes + debounced save |
| Auth | SHA-256 hashed passwords, 8-hour sessions, seeded demo users |
| Routing | Hash-based router with browser back/forward support |
| Audit | Append-only audit log (all CRUD operations tracked) |
| Security | Input sanitization, no client-side API keys, XSS prevention |

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Attending | dr.ortho@hospital.com | Ortho@2024 |
| Resident | resident@hospital.com | Res@2024 |
| Nurse | nurse@hospital.com | Nurse@2024 |

## Running

```bash
npm install
npm run dev
```
