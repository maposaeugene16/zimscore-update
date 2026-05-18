
-- =========================================================
-- ZimScore SRS v2.0 — Phase 1 Foundations
-- Wallet ledger, P2P, Collateral, Crowdfunding, SME,
-- Score consent, Manual review, Audit, Consents, Settings,
-- Platform settings.
-- =========================================================

-- ───── user_settings (language, freeze, threshold, PIN) ─────
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','sn','nd')),
  low_balance_threshold NUMERIC,
  wallet_frozen BOOLEAN NOT NULL DEFAULT false,
  pin_hash TEXT,
  security_q1 TEXT,
  security_a1_hash TEXT,
  security_q2 TEXT,
  security_a2_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_user_settings_updated BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───── wallets ─────
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0,
  locked_balance NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own wallet" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all wallets" ON public.wallets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───── wallet_ledger (immutable) ─────
CREATE TABLE public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('deposit','withdrawal','disbursement','repayment','fee','interest','hold','release_hold','escrow','escrow_release','transfer_in','transfer_out')),
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  reference TEXT,
  counterparty_user_id UUID,
  related_loan_id UUID,
  related_bid_id UUID,
  related_campaign_id UUID,
  balance_after NUMERIC NOT NULL,
  locked_after NUMERIC NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_user ON public.wallet_ledger(user_id, created_at DESC);
CREATE INDEX idx_ledger_wallet ON public.wallet_ledger(wallet_id, created_at DESC);
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
-- Inserts/updates/deletes go through SECURITY DEFINER function only.

-- Block direct UPDATE/DELETE always
CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger entries are immutable';
END;$$;
CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();
CREATE TRIGGER trg_ledger_no_delete BEFORE DELETE ON public.wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();

-- ───── Wallet posting function (SECURITY DEFINER) ─────
-- Adjusts balance/locked atomically, enforces non-negative, writes immutable ledger row.
CREATE OR REPLACE FUNCTION public.post_ledger(
  _user_id UUID,
  _entry_type TEXT,
  _direction TEXT,
  _amount NUMERIC,
  _description TEXT,
  _reference TEXT DEFAULT NULL,
  _counterparty UUID DEFAULT NULL,
  _loan_id UUID DEFAULT NULL,
  _bid_id UUID DEFAULT NULL,
  _campaign_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet RECORD;
  v_new_bal NUMERIC;
  v_new_locked NUMERIC;
  v_frozen BOOLEAN;
  v_ledger_id UUID;
BEGIN
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.wallets(user_id) VALUES (_user_id) RETURNING * INTO v_wallet;
  END IF;

  SELECT COALESCE(wallet_frozen, false) INTO v_frozen FROM public.user_settings WHERE user_id = _user_id;
  IF COALESCE(v_frozen,false) AND _direction = 'debit' AND _entry_type NOT IN ('release_hold') THEN
    RAISE EXCEPTION 'wallet_frozen';
  END IF;

  v_new_bal := v_wallet.balance;
  v_new_locked := v_wallet.locked_balance;

  IF _entry_type = 'hold' THEN
    -- move from available to locked
    v_new_bal := v_new_bal - _amount;
    v_new_locked := v_new_locked + _amount;
  ELSIF _entry_type = 'release_hold' THEN
    v_new_bal := v_new_bal + _amount;
    v_new_locked := v_new_locked - _amount;
  ELSIF _entry_type = 'escrow' THEN
    v_new_bal := v_new_bal - _amount;
    v_new_locked := v_new_locked + _amount;
  ELSIF _entry_type = 'escrow_release' THEN
    v_new_locked := v_new_locked - _amount;
  ELSIF _direction = 'credit' THEN
    v_new_bal := v_new_bal + _amount;
  ELSIF _direction = 'debit' THEN
    v_new_bal := v_new_bal - _amount;
  END IF;

  IF v_new_bal < 0 OR v_new_locked < 0 THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  UPDATE public.wallets
    SET balance = v_new_bal, locked_balance = v_new_locked, updated_at = now()
    WHERE id = v_wallet.id;

  INSERT INTO public.wallet_ledger(
    wallet_id, user_id, entry_type, direction, amount, description, reference,
    counterparty_user_id, related_loan_id, related_bid_id, related_campaign_id,
    balance_after, locked_after, metadata
  ) VALUES (
    v_wallet.id, _user_id, _entry_type, _direction, _amount, _description, _reference,
    _counterparty, _loan_id, _bid_id, _campaign_id, v_new_bal, v_new_locked, _metadata
  ) RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;$$;

-- ───── Auto-create wallet on KYC approval ─────
CREATE OR REPLACE FUNCTION public.auto_create_wallet_on_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status = 'verified' AND (OLD.verification_status IS DISTINCT FROM 'verified') THEN
    INSERT INTO public.wallets(user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.user_settings(user_id) VALUES (NEW.user_id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_profiles_kyc_wallet
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_wallet_on_verified();

-- ───── P2P loan_requests + bids + repayment_schedule ─────
CREATE TABLE public.loan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  purpose TEXT NOT NULL,
  term_months INTEGER NOT NULL CHECK (term_months > 0),
  max_interest_rate NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','funded','active','completed','defaulted','cancelled')),
  accepted_bid_id UUID,
  collateral_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated view loan requests" ON public.loan_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Borrowers create own requests" ON public.loan_requests FOR INSERT TO authenticated WITH CHECK (borrower_id = auth.uid());
CREATE POLICY "Borrowers update own requests" ON public.loan_requests FOR UPDATE TO authenticated USING (borrower_id = auth.uid());
CREATE POLICY "Admins manage requests" ON public.loan_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_loan_requests_updated BEFORE UPDATE ON public.loan_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.loan_requests(id) ON DELETE CASCADE,
  lender_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  interest_rate NUMERIC NOT NULL,
  term_months INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','withdrawn','accepted','rejected')),
  hold_ledger_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lenders view own bids" ON public.bids FOR SELECT TO authenticated USING (lender_id = auth.uid());
CREATE POLICY "Borrowers view bids on own requests" ON public.bids FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_requests r WHERE r.id = bids.request_id AND r.borrower_id = auth.uid()));
CREATE POLICY "Lenders create own bids" ON public.bids FOR INSERT TO authenticated WITH CHECK (lender_id = auth.uid());
CREATE POLICY "Lenders update own bids" ON public.bids FOR UPDATE TO authenticated USING (lender_id = auth.uid());
CREATE TRIGGER trg_bids_updated BEFORE UPDATE ON public.bids FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.repayment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('p2p','mfi')),
  loan_id UUID NOT NULL,
  user_id UUID NOT NULL,
  due_date DATE NOT NULL,
  amount_due NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','due','paid','overdue','partial')),
  reminder_48h_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.repayment_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own schedule" ON public.repayment_schedule FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all schedules" ON public.repayment_schedule FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ───── Collateral assets ─────
CREATE TABLE public.collateral_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset_type TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_value NUMERIC NOT NULL,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','pledged','released','seized')),
  pledged_to_loan_id UUID,
  pledged_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.collateral_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collateral" ON public.collateral_assets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view all collateral" ON public.collateral_assets FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_collateral_updated BEFORE UPDATE ON public.collateral_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───── Crowdfunding ─────
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrepreneur_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  target_amount NUMERIC NOT NULL CHECK (target_amount > 0),
  raised_amount NUMERIC NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','funded','failed','cancelled')),
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view active campaigns" ON public.campaigns FOR SELECT TO authenticated USING (status IN ('active','funded','failed'));
CREATE POLICY "Entrepreneurs manage own campaigns" ON public.campaigns FOR ALL TO authenticated USING (entrepreneur_id = auth.uid()) WITH CHECK (entrepreneur_id = auth.uid());
CREATE POLICY "Admins manage all campaigns" ON public.campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.pledges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'escrow' CHECK (status IN ('escrow','released','refunded')),
  escrow_ledger_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Investors view own pledges" ON public.pledges FOR SELECT TO authenticated USING (investor_id = auth.uid());
CREATE POLICY "Entrepreneurs view pledges on own campaigns" ON public.pledges FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = pledges.campaign_id AND c.entrepreneur_id = auth.uid()));
CREATE POLICY "Investors create own pledges" ON public.pledges FOR INSERT TO authenticated WITH CHECK (investor_id = auth.uid());

-- ───── SME invoices + quotations ─────
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sme_user_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_contact TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  due_date DATE,
  notes TEXT,
  share_token TEXT UNIQUE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SMEs manage own invoices" ON public.invoices FOR ALL TO authenticated USING (sme_user_id = auth.uid()) WITH CHECK (sme_user_id = auth.uid());
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sme_user_id UUID NOT NULL,
  quotation_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_contact TEXT,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  valid_until DATE,
  notes TEXT,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SMEs manage own quotations" ON public.quotations FOR ALL TO authenticated USING (sme_user_id = auth.uid()) WITH CHECK (sme_user_id = auth.uid());
CREATE TRIGGER trg_quotations_updated BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ───── Score consent / share-link / manual review ─────
CREATE TABLE public.score_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID,
  requester_label TEXT NOT NULL,
  user_id UUID NOT NULL,
  access_level INTEGER NOT NULL CHECK (access_level IN (1,2,3)),
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.score_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subjects see own access requests" ON public.score_access_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Requesters see their requests" ON public.score_access_requests FOR SELECT TO authenticated USING (requester_id = auth.uid());
CREATE POLICY "Anyone create access requests" ON public.score_access_requests FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid() OR requester_id IS NULL);
CREATE POLICY "Subjects respond to own requests" ON public.score_access_requests FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.score_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  recipient_label TEXT NOT NULL,
  access_level INTEGER NOT NULL CHECK (access_level IN (1,2,3)),
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.score_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own share links" ON public.score_share_links FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.manual_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  current_score INTEGER,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','rejected')),
  admin_response TEXT,
  admin_id UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.manual_review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own reviews" ON public.manual_review_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users create own reviews" ON public.manual_review_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage all reviews" ON public.manual_review_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ───── Audit logs ─────
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON public.audit_logs(actor_user_id, created_at DESC);
CREATE INDEX idx_audit_target ON public.audit_logs(target_type, target_id);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_audit(_action TEXT, _target_type TEXT, _target_id UUID, _metadata JSONB DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_role TEXT;
BEGIN
  SELECT (CASE WHEN public.has_role(auth.uid(),'admin') THEN 'admin'
               WHEN public.has_role(auth.uid(),'financial_institution') THEN 'fi'
               ELSE 'user' END) INTO v_role;
  INSERT INTO public.audit_logs(actor_user_id,actor_role,action,target_type,target_id,metadata)
    VALUES(auth.uid(),v_role,_action,_target_type,_target_id,_metadata) RETURNING id INTO v_id;
  RETURN v_id;
END;$$;

-- ───── User consents ─────
CREATE TABLE public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('data_processing','marketing','score_sharing','third_party','collateral_seizure')),
  granted BOOLEAN NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own consents" ON public.user_consents FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view consents" ON public.user_consents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ───── Platform settings (singleton) ─────
CREATE TABLE public.platform_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_interest_rate_cap NUMERIC NOT NULL DEFAULT 0.40,
  withdrawal_fee_pct NUMERIC NOT NULL DEFAULT 0.01,
  min_loan_amount NUMERIC NOT NULL DEFAULT 10,
  max_loan_amount NUMERIC NOT NULL DEFAULT 50000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
INSERT INTO public.platform_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view platform settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update platform settings" ON public.platform_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ───── Backfill wallets + settings for existing verified users ─────
INSERT INTO public.wallets(user_id)
  SELECT user_id FROM public.profiles WHERE verification_status = 'verified'
  ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.user_settings(user_id)
  SELECT user_id FROM public.profiles
  ON CONFLICT (user_id) DO NOTHING;
