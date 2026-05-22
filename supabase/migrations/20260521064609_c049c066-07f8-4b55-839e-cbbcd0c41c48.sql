
-- Disputes table
CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complainant_id uuid NOT NULL,
  respondent_id uuid,
  dispute_type text NOT NULL, -- 'loan','campaign','wallet','other'
  related_id uuid,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open', -- open, investigating, resolved, closed
  admin_response text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own disputes" ON public.disputes
  FOR INSERT TO authenticated WITH CHECK (complainant_id = auth.uid());
CREATE POLICY "Users view own disputes" ON public.disputes
  FOR SELECT TO authenticated USING (complainant_id = auth.uid() OR respondent_id = auth.uid());
CREATE POLICY "Admins manage disputes" ON public.disputes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_disputes_updated BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Onboarding flag
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Rate cap enforcement in place_bid
CREATE OR REPLACE FUNCTION public.place_bid(_request_id uuid, _amount numeric, _interest_rate numeric, _term_months integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lender uuid := auth.uid();
  v_req RECORD;
  v_bid_id uuid;
  v_hold uuid;
  v_cap numeric;
BEGIN
  IF v_lender IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_req FROM public.loan_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_request_not_found'; END IF;
  IF v_req.status <> 'open' THEN RAISE EXCEPTION 'loan_not_open'; END IF;
  IF v_req.borrower_id = v_lender THEN RAISE EXCEPTION 'cannot_bid_on_own_loan'; END IF;
  IF _amount <= 0 OR _amount > v_req.amount THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT max_interest_rate_cap INTO v_cap FROM public.platform_settings WHERE id = 1;
  IF _interest_rate < 0 THEN RAISE EXCEPTION 'invalid_rate'; END IF;
  IF _interest_rate > v_req.max_interest_rate THEN RAISE EXCEPTION 'rate_exceeds_borrower_max'; END IF;
  IF v_cap IS NOT NULL AND _interest_rate > (v_cap * 100) THEN
    RAISE EXCEPTION 'rate_exceeds_platform_cap';
  END IF;

  v_hold := public.post_ledger(
    v_lender, 'hold', 'debit', _amount,
    'P2P bid hold on loan ' || _request_id::text,
    'BID-HOLD-' || substr(_request_id::text, 1, 8),
    v_req.borrower_id, _request_id, NULL, NULL, NULL
  );
  INSERT INTO public.bids(request_id, lender_id, amount, interest_rate, term_months, status, hold_ledger_id)
    VALUES (_request_id, v_lender, _amount, _interest_rate, _term_months, 'pending', v_hold)
    RETURNING id INTO v_bid_id;
  PERFORM public.log_audit('p2p_bid_placed', 'bid', v_bid_id, jsonb_build_object('amount', _amount, 'rate', _interest_rate));
  RETURN v_bid_id;
END;
$function$;

-- Raise dispute
CREATE OR REPLACE FUNCTION public.raise_dispute(
  _dispute_type text, _subject text, _description text,
  _respondent_id uuid DEFAULT NULL, _related_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.disputes(complainant_id, respondent_id, dispute_type, related_id, subject, description)
    VALUES(auth.uid(), _respondent_id, _dispute_type, _related_id, _subject, _description)
    RETURNING id INTO v_id;
  PERFORM public.log_audit('dispute_raised','dispute',v_id, jsonb_build_object('type',_dispute_type));
  RETURN v_id;
END;$$;

-- Resolve dispute (admin)
CREATE OR REPLACE FUNCTION public.resolve_dispute(_dispute_id uuid, _status text, _response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF _status NOT IN ('investigating','resolved','closed','open') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.disputes
    SET status = _status, admin_response = _response,
        resolved_by = CASE WHEN _status IN ('resolved','closed') THEN auth.uid() ELSE resolved_by END,
        resolved_at = CASE WHEN _status IN ('resolved','closed') THEN now() ELSE resolved_at END,
        updated_at = now()
    WHERE id = _dispute_id;
  PERFORM public.log_audit('dispute_'||_status,'dispute',_dispute_id, jsonb_build_object('response',_response));
END;$$;

-- Update platform settings (admin)
CREATE OR REPLACE FUNCTION public.update_platform_settings(
  _min_loan numeric, _max_loan numeric, _withdrawal_fee numeric, _rate_cap numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF _min_loan < 0 OR _max_loan < _min_loan OR _withdrawal_fee < 0 OR _rate_cap < 0 OR _rate_cap > 1 THEN
    RAISE EXCEPTION 'invalid_settings';
  END IF;
  UPDATE public.platform_settings
    SET min_loan_amount = _min_loan, max_loan_amount = _max_loan,
        withdrawal_fee_pct = _withdrawal_fee, max_interest_rate_cap = _rate_cap,
        updated_at = now(), updated_by = auth.uid()
    WHERE id = 1;
  PERFORM public.log_audit('platform_settings_updated','platform_settings',NULL,
    jsonb_build_object('min',_min_loan,'max',_max_loan,'fee',_withdrawal_fee,'cap',_rate_cap));
END;$$;

-- Export my data
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id = v_uid),
    'settings', (SELECT to_jsonb(s) - 'pin_hash' - 'security_a1_hash' - 'security_a2_hash' FROM public.user_settings s WHERE s.user_id = v_uid),
    'wallet', (SELECT to_jsonb(w) FROM public.wallets w WHERE w.user_id = v_uid),
    'ledger', (SELECT COALESCE(jsonb_agg(to_jsonb(l)),'[]'::jsonb) FROM public.wallet_ledger l WHERE l.user_id = v_uid),
    'loan_requests', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.loan_requests r WHERE r.borrower_id = v_uid),
    'bids', (SELECT COALESCE(jsonb_agg(to_jsonb(b)),'[]'::jsonb) FROM public.bids b WHERE b.lender_id = v_uid),
    'repayments', (SELECT COALESCE(jsonb_agg(to_jsonb(rs)),'[]'::jsonb) FROM public.repayment_schedule rs WHERE rs.user_id = v_uid),
    'collateral', (SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.collateral_assets c WHERE c.user_id = v_uid),
    'campaigns', (SELECT COALESCE(jsonb_agg(to_jsonb(cm)),'[]'::jsonb) FROM public.campaigns cm WHERE cm.entrepreneur_id = v_uid),
    'pledges', (SELECT COALESCE(jsonb_agg(to_jsonb(pl)),'[]'::jsonb) FROM public.pledges pl WHERE pl.investor_id = v_uid),
    'invoices', (SELECT COALESCE(jsonb_agg(to_jsonb(i)),'[]'::jsonb) FROM public.invoices i WHERE i.sme_user_id = v_uid),
    'quotations', (SELECT COALESCE(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM public.quotations q WHERE q.sme_user_id = v_uid),
    'credit_documents', (SELECT COALESCE(jsonb_agg(to_jsonb(cd) - 'file_url'),'[]'::jsonb) FROM public.credit_documents cd WHERE cd.user_id = v_uid),
    'consents', (SELECT COALESCE(jsonb_agg(to_jsonb(uc)),'[]'::jsonb) FROM public.user_consents uc WHERE uc.user_id = v_uid)
  ) INTO v_out;
  PERFORM public.log_audit('data_exported','user',v_uid,NULL);
  RETURN v_out;
END;$$;

-- Delete (anonymise) my account
CREATE OR REPLACE FUNCTION public.delete_my_account(_confirm text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _confirm <> 'DELETE' THEN RAISE EXCEPTION 'confirmation_required'; END IF;

  UPDATE public.profiles
    SET full_name = 'Deleted User',
        national_id_front_url = NULL,
        national_id_back_url = NULL,
        passport_photo_url = NULL,
        verification_status = 'deleted',
        updated_at = now()
    WHERE user_id = v_uid;

  UPDATE public.user_settings
    SET pin_hash = NULL, security_q1=NULL, security_q2=NULL,
        security_a1_hash=NULL, security_a2_hash=NULL, wallet_frozen=true,
        updated_at=now()
    WHERE user_id = v_uid;

  UPDATE public.score_share_links SET revoked = true WHERE user_id = v_uid;

  PERFORM public.log_audit('account_deleted','user',v_uid,NULL);
END;$$;
