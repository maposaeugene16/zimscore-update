-- 1. Add financial_institution role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financial_institution';

-- 2. financial_institutions table
CREATE TABLE public.financial_institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  institution_name TEXT NOT NULL,
  license_number TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  description TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FIs view own profile" ON public.financial_institutions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "FIs insert own profile" ON public.financial_institutions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "FIs update own profile" ON public.financial_institutions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all FIs" ON public.financial_institutions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all FIs" ON public.financial_institutions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone view approved FIs" ON public.financial_institutions
  FOR SELECT TO authenticated USING (status = 'approved');

-- 3. loan_products table
CREATE TABLE public.loan_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fi_id UUID NOT NULL REFERENCES public.financial_institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  min_amount NUMERIC NOT NULL DEFAULT 0,
  max_amount NUMERIC NOT NULL,
  interest_rate NUMERIC NOT NULL,
  term_months INTEGER NOT NULL,
  min_credit_score INTEGER NOT NULL DEFAULT 0,
  requirements TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone view active products from approved FIs" ON public.loan_products
  FOR SELECT TO authenticated USING (
    active = true AND EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = loan_products.fi_id AND fi.status = 'approved'
    )
  );
CREATE POLICY "FI manages own products" ON public.loan_products
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = loan_products.fi_id AND fi.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = loan_products.fi_id AND fi.user_id = auth.uid()
    )
  );
CREATE POLICY "Admins manage all products" ON public.loan_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. loan_applications table
CREATE TABLE public.loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  fi_id UUID NOT NULL REFERENCES public.financial_institutions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.loan_products(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Borrowers view own applications" ON public.loan_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Borrowers create own applications" ON public.loan_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "FIs view applications to them" ON public.loan_applications
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = loan_applications.fi_id AND fi.user_id = auth.uid()
    )
  );
CREATE POLICY "FIs decide applications to them" ON public.loan_applications
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.financial_institutions fi
      WHERE fi.id = loan_applications.fi_id AND fi.user_id = auth.uid()
    )
  );
CREATE POLICY "Admins view all applications" ON public.loan_applications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. credit_documents table
CREATE TABLE public.credit_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  doc_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  verification_reason TEXT,
  confidence NUMERIC,
  fraud_indicators JSONB,
  extracted_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credit docs" ON public.credit_documents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own credit docs" ON public.credit_documents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own credit docs" ON public.credit_documents
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins view all credit docs" ON public.credit_documents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_fi_updated BEFORE UPDATE ON public.financial_institutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lp_updated BEFORE UPDATE ON public.loan_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_la_updated BEFORE UPDATE ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cd_updated BEFORE UPDATE ON public.credit_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Storage bucket for credit documents
INSERT INTO storage.buckets (id, name, public) VALUES ('credit-documents', 'credit-documents', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own credit docs storage" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'credit-documents' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users upload own credit docs storage" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'credit-documents' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Admins read all credit docs storage" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'credit-documents' AND public.has_role(auth.uid(), 'admin')
  );

-- 8. Trigger: when admin approves an FI, auto-grant the financial_institution role
CREATE OR REPLACE FUNCTION public.grant_fi_role_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'financial_institution')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_grant_fi_role
  AFTER UPDATE ON public.financial_institutions
  FOR EACH ROW EXECUTE FUNCTION public.grant_fi_role_on_approval();