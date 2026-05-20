
-- =========================================================================
-- 1. Replace accept_bid to also lock collateral asset (if borrower attached one)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.accept_bid(_bid_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bid RECORD; v_req RECORD; v_borrower uuid := auth.uid();
  v_other RECORD; v_total_due numeric; v_per_month numeric; v_i integer;
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = _bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bid_not_found'; END IF;
  SELECT * INTO v_req FROM public.loan_requests WHERE id = v_bid.request_id FOR UPDATE;
  IF v_req.borrower_id <> v_borrower THEN RAISE EXCEPTION 'not_borrower'; END IF;
  IF v_req.status <> 'open' THEN RAISE EXCEPTION 'loan_not_open'; END IF;
  IF v_bid.status <> 'pending' THEN RAISE EXCEPTION 'bid_not_pending'; END IF;

  PERFORM public.post_ledger(v_bid.lender_id,'release_hold','credit',v_bid.amount,
    'P2P bid accepted — release hold','BID-ACCEPT-'||substr(_bid_id::text,1,8),
    v_borrower,v_req.id,_bid_id,NULL,NULL);
  PERFORM public.post_ledger(v_bid.lender_id,'disbursement','debit',v_bid.amount,
    'P2P loan disbursed to borrower','DISB-'||substr(_bid_id::text,1,8),
    v_borrower,v_req.id,_bid_id,NULL,NULL);
  PERFORM public.post_ledger(v_borrower,'disbursement','credit',v_bid.amount,
    'P2P loan received','DISB-'||substr(_bid_id::text,1,8),
    v_bid.lender_id,v_req.id,_bid_id,NULL,NULL);

  FOR v_other IN SELECT * FROM public.bids WHERE request_id = v_req.id AND status='pending' AND id<>_bid_id LOOP
    PERFORM public.post_ledger(v_other.lender_id,'release_hold','credit',v_other.amount,
      'P2P bid not accepted — funds released','BID-REJ-'||substr(v_other.id::text,1,8),
      NULL,v_req.id,v_other.id,NULL,NULL);
    UPDATE public.bids SET status='rejected', updated_at=now() WHERE id=v_other.id;
  END LOOP;

  UPDATE public.bids SET status='accepted', updated_at=now() WHERE id=_bid_id;
  UPDATE public.loan_requests SET status='funded', accepted_bid_id=_bid_id, updated_at=now() WHERE id=v_req.id;

  -- Lock collateral if attached
  IF v_req.collateral_asset_id IS NOT NULL THEN
    UPDATE public.collateral_assets
      SET status='pledged', pledged_to_loan_id=v_req.id, pledged_at=now(), updated_at=now()
      WHERE id=v_req.collateral_asset_id AND user_id=v_borrower AND status='available';
  END IF;

  v_total_due := v_bid.amount * (1 + v_bid.interest_rate / 100.0);
  v_per_month := round(v_total_due / GREATEST(v_bid.term_months,1), 2);
  FOR v_i IN 1..v_bid.term_months LOOP
    INSERT INTO public.repayment_schedule(loan_id,user_id,due_date,amount_due,source,status)
    VALUES (v_req.id, v_borrower, (current_date + (v_i * INTERVAL '1 month'))::date,
            CASE WHEN v_i = v_bid.term_months THEN v_total_due - (v_per_month*(v_bid.term_months-1)) ELSE v_per_month END,
            'p2p','upcoming');
  END LOOP;

  PERFORM public.log_audit('p2p_bid_accepted','bid',_bid_id, jsonb_build_object('amount',v_bid.amount,'rate',v_bid.interest_rate));
END;
$function$;

-- =========================================================================
-- 2. Replace repay_installment to also release collateral on completion
-- =========================================================================
CREATE OR REPLACE FUNCTION public.repay_installment(_schedule_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_sched RECORD; v_bid RECORD; v_req RECORD;
BEGIN
  SELECT * INTO v_sched FROM public.repayment_schedule WHERE id=_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_found'; END IF;
  IF v_sched.user_id <> auth.uid() THEN RAISE EXCEPTION 'not_borrower'; END IF;
  IF v_sched.status='paid' THEN RAISE EXCEPTION 'already_paid'; END IF;

  SELECT * INTO v_req FROM public.loan_requests WHERE id=v_sched.loan_id;
  SELECT * INTO v_bid FROM public.bids WHERE id=v_req.accepted_bid_id;

  PERFORM public.post_ledger(v_sched.user_id,'repayment','debit',v_sched.amount_due,
    'Loan repayment','REPAY-'||substr(_schedule_id::text,1,8),
    v_bid.lender_id,v_req.id,v_bid.id,NULL,NULL);
  PERFORM public.post_ledger(v_bid.lender_id,'repayment','credit',v_sched.amount_due,
    'Loan repayment received','REPAY-'||substr(_schedule_id::text,1,8),
    v_sched.user_id,v_req.id,v_bid.id,NULL,NULL);

  UPDATE public.repayment_schedule
    SET amount_paid=amount_due, status='paid', paid_at=now()
    WHERE id=_schedule_id;

  IF NOT EXISTS (SELECT 1 FROM public.repayment_schedule WHERE loan_id=v_req.id AND status<>'paid') THEN
    UPDATE public.loan_requests SET status='completed', updated_at=now() WHERE id=v_req.id;
    -- Release collateral
    IF v_req.collateral_asset_id IS NOT NULL THEN
      UPDATE public.collateral_assets
        SET status='available', pledged_to_loan_id=NULL, released_at=now(), updated_at=now()
        WHERE id=v_req.collateral_asset_id;
    END IF;
  END IF;

  PERFORM public.log_audit('p2p_repayment','schedule',_schedule_id, jsonb_build_object('amount',v_sched.amount_due));
END;
$function$;

-- =========================================================================
-- 3. Crowdfunding: pledge / release / refund
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pledge_to_campaign(_campaign_id uuid, _amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_investor uuid := auth.uid(); v_camp RECORD; v_pid uuid; v_esc uuid;
BEGIN
  IF v_investor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO v_camp FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF v_camp.status <> 'active' THEN RAISE EXCEPTION 'campaign_not_active'; END IF;
  IF v_camp.entrepreneur_id = v_investor THEN RAISE EXCEPTION 'cannot_back_own_campaign'; END IF;

  v_esc := public.post_ledger(v_investor,'escrow','debit',_amount,
    'Crowdfunding pledge — held in escrow',
    'PLEDGE-'||substr(_campaign_id::text,1,8),
    v_camp.entrepreneur_id, NULL, NULL, _campaign_id, NULL);

  INSERT INTO public.pledges(campaign_id, investor_id, amount, status, escrow_ledger_id)
    VALUES(_campaign_id, v_investor, _amount, 'escrow', v_esc) RETURNING id INTO v_pid;

  UPDATE public.campaigns SET raised_amount = raised_amount + _amount, updated_at=now() WHERE id=_campaign_id;

  -- Auto-mark funded
  IF (v_camp.raised_amount + _amount) >= v_camp.target_amount THEN
    UPDATE public.campaigns SET status='funded', updated_at=now() WHERE id=_campaign_id;
  END IF;

  PERFORM public.log_audit('crowdfund_pledge','pledge',v_pid, jsonb_build_object('amount',_amount,'campaign',_campaign_id));
  RETURN v_pid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_campaign_funds(_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_camp RECORD; v_pl RECORD;
BEGIN
  SELECT * INTO v_camp FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF v_camp.entrepreneur_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  IF v_camp.status NOT IN ('funded','active') THEN RAISE EXCEPTION 'cannot_release'; END IF;

  FOR v_pl IN SELECT * FROM public.pledges WHERE campaign_id=_campaign_id AND status='escrow' LOOP
    -- Release investor's locked balance (reduce locked, no balance back)
    PERFORM public.post_ledger(v_pl.investor_id,'escrow_release','debit',v_pl.amount,
      'Crowdfunding escrow released to entrepreneur',
      'CRW-REL-'||substr(v_pl.id::text,1,8),
      v_camp.entrepreneur_id,NULL,NULL,_campaign_id,NULL);
    -- Credit entrepreneur
    PERFORM public.post_ledger(v_camp.entrepreneur_id,'disbursement','credit',v_pl.amount,
      'Crowdfunding funds received',
      'CRW-DISB-'||substr(v_pl.id::text,1,8),
      v_pl.investor_id,NULL,NULL,_campaign_id,NULL);
    UPDATE public.pledges SET status='released' WHERE id=v_pl.id;
  END LOOP;

  UPDATE public.campaigns SET status='completed', updated_at=now() WHERE id=_campaign_id;
  PERFORM public.log_audit('crowdfund_released','campaign',_campaign_id, NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_campaign(_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_camp RECORD; v_pl RECORD;
BEGIN
  SELECT * INTO v_camp FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF v_camp.entrepreneur_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  FOR v_pl IN SELECT * FROM public.pledges WHERE campaign_id=_campaign_id AND status='escrow' LOOP
    -- Reduce locked
    PERFORM public.post_ledger(v_pl.investor_id,'escrow_release','debit',v_pl.amount,
      'Crowdfunding escrow refunded','CRW-REF-LOCK-'||substr(v_pl.id::text,1,8),
      NULL,NULL,NULL,_campaign_id,NULL);
    -- Credit balance back
    PERFORM public.post_ledger(v_pl.investor_id,'refund','credit',v_pl.amount,
      'Crowdfunding refund','CRW-REF-'||substr(v_pl.id::text,1,8),
      NULL,NULL,NULL,_campaign_id,NULL);
    UPDATE public.pledges SET status='refunded' WHERE id=v_pl.id;
  END LOOP;

  UPDATE public.campaigns SET status='failed', updated_at=now() WHERE id=_campaign_id;
  PERFORM public.log_audit('crowdfund_refunded','campaign',_campaign_id, NULL);
END;
$function$;

-- =========================================================================
-- 4. Score access response
-- =========================================================================
CREATE OR REPLACE FUNCTION public.respond_score_access(_request_id uuid, _approve boolean)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM public.score_access_requests WHERE id=_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.user_id <> auth.uid() THEN RAISE EXCEPTION 'not_subject'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'already_responded'; END IF;

  UPDATE public.score_access_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'denied' END,
        responded_at = now(),
        expires_at = CASE WHEN _approve THEN now() + INTERVAL '30 day' ELSE NULL END
    WHERE id=_request_id;
  PERFORM public.log_audit('score_access_'||(CASE WHEN _approve THEN 'approved' ELSE 'denied' END),'access_request',_request_id, NULL);
END;
$function$;

-- =========================================================================
-- 5. Public shared score lookup (token, no login)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_shared_score(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_link RECORD; v_doc_count int; v_score int; v_band text;
BEGIN
  SELECT * INTO v_link FROM public.score_share_links WHERE token=_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF v_link.revoked THEN RETURN jsonb_build_object('error','revoked'); END IF;
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('error','expired');
  END IF;

  UPDATE public.score_share_links SET view_count = view_count + 1 WHERE id = v_link.id;

  -- Score derived from verified credit docs count (mirror frontend logic, simplified)
  SELECT count(*) INTO v_doc_count FROM public.credit_documents
    WHERE user_id=v_link.user_id AND verification_status='verified';

  v_score := LEAST(850, GREATEST(0, v_doc_count * 120));
  v_band := CASE WHEN v_score>=750 THEN 'Excellent'
                 WHEN v_score>=650 THEN 'Very Good'
                 WHEN v_score>=500 THEN 'Good'
                 WHEN v_score>=300 THEN 'Fair'
                 WHEN v_score>0 THEN 'Poor' ELSE 'No Data' END;

  RETURN jsonb_build_object(
    'access_level', v_link.access_level,
    'recipient_label', v_link.recipient_label,
    'score', CASE WHEN v_link.access_level >= 1 THEN v_score ELSE NULL END,
    'band', v_band,
    'verified_documents', CASE WHEN v_link.access_level >= 2 THEN v_doc_count ELSE NULL END,
    'expires_at', v_link.expires_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_shared_score(text) TO anon, authenticated;
