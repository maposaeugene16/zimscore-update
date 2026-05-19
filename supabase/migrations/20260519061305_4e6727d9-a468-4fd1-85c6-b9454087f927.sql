-- One active loan request per borrower
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_loan_request_per_borrower
  ON public.loan_requests(borrower_id) WHERE status = 'open';

-- ============ place_bid ============
CREATE OR REPLACE FUNCTION public.place_bid(
  _request_id uuid,
  _amount numeric,
  _interest_rate numeric,
  _term_months integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lender uuid := auth.uid();
  v_req RECORD;
  v_bid_id uuid;
  v_hold uuid;
BEGIN
  IF v_lender IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_req FROM public.loan_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loan_request_not_found'; END IF;
  IF v_req.status <> 'open' THEN RAISE EXCEPTION 'loan_not_open'; END IF;
  IF v_req.borrower_id = v_lender THEN RAISE EXCEPTION 'cannot_bid_on_own_loan'; END IF;
  IF _amount <= 0 OR _amount > v_req.amount THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF _interest_rate < 0 OR _interest_rate > v_req.max_interest_rate THEN RAISE EXCEPTION 'rate_exceeds_max'; END IF;

  -- Hold lender funds
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
$$;

-- ============ withdraw_bid ============
CREATE OR REPLACE FUNCTION public.withdraw_bid(_bid_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid RECORD;
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = _bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bid_not_found'; END IF;
  IF v_bid.lender_id <> auth.uid() THEN RAISE EXCEPTION 'not_owner'; END IF;
  IF v_bid.status <> 'pending' THEN RAISE EXCEPTION 'bid_not_pending'; END IF;

  PERFORM public.post_ledger(
    v_bid.lender_id, 'release_hold', 'credit', v_bid.amount,
    'P2P bid withdrawn', 'BID-RELEASE-' || substr(_bid_id::text, 1, 8),
    NULL, v_bid.request_id, _bid_id, NULL, NULL
  );
  UPDATE public.bids SET status = 'withdrawn', updated_at = now() WHERE id = _bid_id;
END;
$$;

-- ============ accept_bid ============
CREATE OR REPLACE FUNCTION public.accept_bid(_bid_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid RECORD;
  v_req RECORD;
  v_borrower uuid := auth.uid();
  v_other RECORD;
  v_total_due numeric;
  v_per_month numeric;
  v_i integer;
BEGIN
  SELECT * INTO v_bid FROM public.bids WHERE id = _bid_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bid_not_found'; END IF;

  SELECT * INTO v_req FROM public.loan_requests WHERE id = v_bid.request_id FOR UPDATE;
  IF v_req.borrower_id <> v_borrower THEN RAISE EXCEPTION 'not_borrower'; END IF;
  IF v_req.status <> 'open' THEN RAISE EXCEPTION 'loan_not_open'; END IF;
  IF v_bid.status <> 'pending' THEN RAISE EXCEPTION 'bid_not_pending'; END IF;

  -- Release lender hold then transfer to borrower (sub-second disbursement)
  PERFORM public.post_ledger(
    v_bid.lender_id, 'release_hold', 'credit', v_bid.amount,
    'P2P bid accepted — release hold', 'BID-ACCEPT-' || substr(_bid_id::text, 1, 8),
    v_borrower, v_req.id, _bid_id, NULL, NULL
  );
  PERFORM public.post_ledger(
    v_bid.lender_id, 'disbursement', 'debit', v_bid.amount,
    'P2P loan disbursed to borrower', 'DISB-' || substr(_bid_id::text, 1, 8),
    v_borrower, v_req.id, _bid_id, NULL, NULL
  );
  PERFORM public.post_ledger(
    v_borrower, 'disbursement', 'credit', v_bid.amount,
    'P2P loan received', 'DISB-' || substr(_bid_id::text, 1, 8),
    v_bid.lender_id, v_req.id, _bid_id, NULL, NULL
  );

  -- Release all other pending bids
  FOR v_other IN SELECT * FROM public.bids WHERE request_id = v_req.id AND status = 'pending' AND id <> _bid_id LOOP
    PERFORM public.post_ledger(
      v_other.lender_id, 'release_hold', 'credit', v_other.amount,
      'P2P bid not accepted — funds released', 'BID-REJ-' || substr(v_other.id::text, 1, 8),
      NULL, v_req.id, v_other.id, NULL, NULL
    );
    UPDATE public.bids SET status = 'rejected', updated_at = now() WHERE id = v_other.id;
  END LOOP;

  UPDATE public.bids SET status = 'accepted', updated_at = now() WHERE id = _bid_id;
  UPDATE public.loan_requests SET status = 'funded', accepted_bid_id = _bid_id, updated_at = now() WHERE id = v_req.id;

  -- Build repayment schedule (simple flat interest, divided across months)
  v_total_due := v_bid.amount * (1 + v_bid.interest_rate / 100.0);
  v_per_month := round(v_total_due / GREATEST(v_bid.term_months, 1), 2);

  FOR v_i IN 1..v_bid.term_months LOOP
    INSERT INTO public.repayment_schedule(loan_id, user_id, due_date, amount_due, source, status)
    VALUES (v_req.id, v_borrower, (current_date + (v_i * INTERVAL '1 month'))::date,
            CASE WHEN v_i = v_bid.term_months THEN v_total_due - (v_per_month * (v_bid.term_months - 1)) ELSE v_per_month END,
            'p2p', 'upcoming');
  END LOOP;

  PERFORM public.log_audit('p2p_bid_accepted','bid',_bid_id, jsonb_build_object('amount', v_bid.amount, 'rate', v_bid.interest_rate));
END;
$$;

-- ============ repay_installment ============
CREATE OR REPLACE FUNCTION public.repay_installment(_schedule_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched RECORD;
  v_bid RECORD;
  v_req RECORD;
BEGIN
  SELECT * INTO v_sched FROM public.repayment_schedule WHERE id = _schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_found'; END IF;
  IF v_sched.user_id <> auth.uid() THEN RAISE EXCEPTION 'not_borrower'; END IF;
  IF v_sched.status = 'paid' THEN RAISE EXCEPTION 'already_paid'; END IF;

  SELECT * INTO v_req FROM public.loan_requests WHERE id = v_sched.loan_id;
  SELECT * INTO v_bid FROM public.bids WHERE id = v_req.accepted_bid_id;

  PERFORM public.post_ledger(
    v_sched.user_id, 'repayment', 'debit', v_sched.amount_due,
    'Loan repayment', 'REPAY-' || substr(_schedule_id::text, 1, 8),
    v_bid.lender_id, v_req.id, v_bid.id, NULL, NULL
  );
  PERFORM public.post_ledger(
    v_bid.lender_id, 'repayment', 'credit', v_sched.amount_due,
    'Loan repayment received', 'REPAY-' || substr(_schedule_id::text, 1, 8),
    v_sched.user_id, v_req.id, v_bid.id, NULL, NULL
  );

  UPDATE public.repayment_schedule
    SET amount_paid = amount_due, status = 'paid', paid_at = now()
    WHERE id = _schedule_id;

  -- If no more upcoming, mark loan completed
  IF NOT EXISTS (SELECT 1 FROM public.repayment_schedule WHERE loan_id = v_req.id AND status <> 'paid') THEN
    UPDATE public.loan_requests SET status = 'completed', updated_at = now() WHERE id = v_req.id;
  END IF;

  PERFORM public.log_audit('p2p_repayment','schedule',_schedule_id, jsonb_build_object('amount', v_sched.amount_due));
END;
$$;

-- ============ mark_reminders_due (cron) ============
CREATE OR REPLACE FUNCTION public.mark_reminders_due() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 48h reminder
  UPDATE public.repayment_schedule
    SET reminder_48h_sent = true
    WHERE status IN ('upcoming','overdue')
      AND reminder_48h_sent = false
      AND due_date <= (current_date + INTERVAL '2 day')::date
      AND due_date > (current_date + INTERVAL '1 day')::date;
  -- 24h reminder
  UPDATE public.repayment_schedule
    SET reminder_24h_sent = true
    WHERE status IN ('upcoming','overdue')
      AND reminder_24h_sent = false
      AND due_date <= (current_date + INTERVAL '1 day')::date;
  -- overdue flagging
  UPDATE public.repayment_schedule
    SET status = 'overdue'
    WHERE status = 'upcoming' AND due_date < current_date;
END;
$$;

-- ============ wallet_deposit / wallet_withdraw (mock rails) ============
CREATE OR REPLACE FUNCTION public.wallet_deposit(
  _amount numeric, _method text, _reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount <= 0 OR _amount > 10000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  v_id := public.post_ledger(auth.uid(), 'deposit', 'credit', _amount,
    'Deposit via ' || COALESCE(_method,'unknown'),
    COALESCE(_reference, 'DEP-' || substr(gen_random_uuid()::text,1,8)),
    NULL, NULL, NULL, NULL,
    jsonb_build_object('method', _method));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_withdraw(
  _amount numeric, _method text, _destination text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_fee numeric; v_fee_pct numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT withdrawal_fee_pct INTO v_fee_pct FROM public.platform_settings WHERE id = 1;
  v_fee := round(_amount * COALESCE(v_fee_pct, 0.01), 2);

  v_id := public.post_ledger(auth.uid(), 'withdrawal', 'debit', _amount,
    'Withdrawal to ' || COALESCE(_method,'unknown') || ' ' || COALESCE(_destination,''),
    'WTH-' || substr(gen_random_uuid()::text,1,8),
    NULL, NULL, NULL, NULL,
    jsonb_build_object('method', _method, 'destination', _destination));
  IF v_fee > 0 THEN
    PERFORM public.post_ledger(auth.uid(), 'fee', 'debit', v_fee,
      'Withdrawal fee (' || (v_fee_pct*100)::text || '%)',
      'FEE-' || substr(v_id::text,1,8),
      NULL, NULL, NULL, NULL, NULL);
  END IF;
  RETURN v_id;
END;
$$;

-- Seed platform settings if missing
INSERT INTO public.platform_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;