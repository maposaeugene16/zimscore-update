## SRS v2.0 Gap Analysis & Implementation Plan

### What's already built (✅ keep)

| Area | Status |
|---|---|
| Auth (email/password + Google) | ✅ + HIBP enabled |
| KYC registration (4-step, AI ID + selfie verify) | ✅ |
| Credit Score engine (Phase 1+2 formulas, 0–850) | ✅ |
| Document forgery detection (EcoCash/bank/receipts) | ✅ |
| FI onboarding + admin approval + FI Dashboard | ✅ |
| MFI Marketplace (live data) | ✅ |
| Loan products + loan applications tables | ✅ |
| Admin Portal (KYC, FI approvals, analytics, audit shell) | ✅ |
| Notifications center | ✅ |
| Sidebar layout, dark/glass theme | ✅ |

### Gaps vs SRS Must-haves

**Wallet (§2)** — UI exists but state is in-memory mock.
- Missing: persistent `wallets` table + immutable `wallet_ledger`, server-side auto-creation on KYC approval (WAL-FR-001), DB-enforced `balance ≥ 0` (WAL-BR-001), wallet freeze flag, low-balance threshold, PIN + reset flow, deposit/withdraw recorded as ledger rows (stubbed gateway).

**P2P Lending (§5)** — UI is mock only.
- Missing: `loan_requests`, `bids` tables; ring-fenced funds on bid (WAL-FR-004), 60-sec auto-disbursement on accept (WAL-FR-005), scheduled auto-repayment (WAL-FR-006), 48h/24h reminders, lender repayment history view.

**Credit Score consent (§3)** — engine works, consent layer missing.
- Missing: `score_access_requests` table, push-notification approve/deny (SCR-FR-012), share-link with controlled access levels (SCR-FR-026), manual review request (72h SLA).

**Collateral Registry (§4)** — module does not exist.
- Missing: `/collateral` page, `collateral_assets` table (asset type, value, encumbrance status, photos), assignment to active loans, release on full repayment.

**Crowdfunding (§8)** — UI mock only.
- Missing: `campaigns`, `pledges` tables, escrow held in wallet until milestone (WAL-FR-010 / CRW), real-time progress bar from DB, countdown.

**SME Hub (§7)** — basic UI only.
- Missing: `invoices`, `quotations` tables; send/share to client; payment status; feeding income into score.

**Admin (§13)** — partial.
- Missing: `audit_logs` table writing every admin action (ADM-FR-008), interest-rate cap config, dispute queue.

**Data Protection (§9)** — RLS exists; missing explicit consent records, data-export and delete-my-account flows (right to erasure).

**Localisation (§12)** — none. Need EN / SN (Shona) / ND (Ndebele) with `react-i18next`, lang selector on registration + header.

**Onboarding (§11)** — Tutorial / first-run walkthrough missing.

---

### Phased Implementation (proposed)

I'll ship in 4 commits so you can review each phase. Real payment/SMS/USSD/RBZ rails stay stubbed (per your choice) — every payment call returns a fake success and writes a ledger row.

**Phase 1 — Foundations (DB + i18n)**
1. Migration: `wallets`, `wallet_ledger`, `loan_requests`, `bids`, `repayment_schedule`, `collateral_assets`, `campaigns`, `pledges`, `invoices`, `quotations`, `score_access_requests`, `score_share_links`, `manual_review_requests`, `audit_logs`, `user_consents`, `user_settings (language, low_balance_threshold, wallet_frozen, pin_hash)`. Full RLS + triggers (auto-create wallet on KYC approval, immutable ledger, balance check, audit logging).
2. Wire `react-i18next` with EN baseline + SN + ND JSON dictionaries (machine-translated; flagged for human review). Language selector in header + registration.

**Phase 2 — Wallet & P2P go real**
3. Replace WalletPage mock with live `wallet_ledger` queries; freeze/PIN/threshold persisted; deposit/withdraw write ledger rows via stub edge function.
4. P2P: borrower posts loan request → lender funds wallet → bid ring-fences via ledger HOLD entry → accept triggers transfer + builds repayment schedule → cron-style edge function processes due repayments + reminders.

**Phase 3 — Collateral, Crowdfunding, SME, Score consent**
5. Build `/collateral` page (list, add asset with photos, attach to loan, release).
6. Crowdfunding pledges with escrow holds, real progress bar.
7. SME invoices/quotations generator with PDF export & share link.
8. Score: consent request flow, shareable verified score links (Level 1/2/3), manual-review form.

**Phase 4 — Admin & compliance polish**
9. Audit logs viewer + filter; interest-rate cap admin setting; dispute queue table.
10. "Export my data" + "Delete my account" buttons (right-to-erasure).
11. First-run onboarding tour (driver.js or custom).

---

### What I'm NOT doing (per your choices)

- Real EcoCash/Paynow/bank disbursement APIs (stubs return success)
- SMS gateway (toast notifications stand in for SMS)
- USSD channel (Phase 2 of SRS, not now)
- RBZ Collateral Registry API sync (Phase 3 of SRS)
- AWS af-south-1 data-residency migration (infra change, not app code)

I'll start with **Phase 1** immediately on approval, then check in after each phase before proceeding to the next.
