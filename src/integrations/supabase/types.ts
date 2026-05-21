export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      bids: {
        Row: {
          amount: number
          created_at: string
          hold_ledger_id: string | null
          id: string
          interest_rate: number
          lender_id: string
          request_id: string
          status: string
          term_months: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          hold_ledger_id?: string | null
          id?: string
          interest_rate: number
          lender_id: string
          request_id: string
          status?: string
          term_months: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          hold_ledger_id?: string | null
          id?: string
          interest_rate?: number
          lender_id?: string
          request_id?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "loan_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          category: string | null
          cover_image_url: string | null
          created_at: string
          deadline: string
          description: string
          entrepreneur_id: string
          id: string
          raised_amount: number
          status: string
          target_amount: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          deadline: string
          description: string
          entrepreneur_id: string
          id?: string
          raised_amount?: number
          status?: string
          target_amount: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          deadline?: string
          description?: string
          entrepreneur_id?: string
          id?: string
          raised_amount?: number
          status?: string
          target_amount?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      collateral_assets: {
        Row: {
          asset_type: string
          created_at: string
          description: string
          estimated_value: number
          id: string
          photo_urls: Json
          pledged_at: string | null
          pledged_to_loan_id: string | null
          released_at: string | null
          serial_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          description: string
          estimated_value: number
          id?: string
          photo_urls?: Json
          pledged_at?: string | null
          pledged_to_loan_id?: string | null
          released_at?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          description?: string
          estimated_value?: number
          id?: string
          photo_urls?: Json
          pledged_at?: string | null
          pledged_to_loan_id?: string | null
          released_at?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_documents: {
        Row: {
          confidence: number | null
          created_at: string
          doc_type: string
          extracted_data: Json | null
          file_name: string
          file_url: string
          fraud_indicators: Json | null
          id: string
          updated_at: string
          user_id: string
          verification_reason: string | null
          verification_status: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          doc_type: string
          extracted_data?: Json | null
          file_name: string
          file_url: string
          fraud_indicators?: Json | null
          id?: string
          updated_at?: string
          user_id: string
          verification_reason?: string | null
          verification_status?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          doc_type?: string
          extracted_data?: Json | null
          file_name?: string
          file_url?: string
          fraud_indicators?: Json | null
          id?: string
          updated_at?: string
          user_id?: string
          verification_reason?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          admin_response: string | null
          complainant_id: string
          created_at: string
          description: string
          dispute_type: string
          id: string
          related_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          respondent_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          admin_response?: string | null
          complainant_id: string
          created_at?: string
          description: string
          dispute_type: string
          id?: string
          related_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          respondent_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          admin_response?: string | null
          complainant_id?: string
          created_at?: string
          description?: string
          dispute_type?: string
          id?: string
          related_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          respondent_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      ecocash_statements: {
        Row: {
          confidence: number | null
          created_at: string
          extracted_data: Json | null
          file_name: string
          file_url: string
          id: string
          updated_at: string
          user_id: string
          verification_reason: string | null
          verification_status: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json | null
          file_name: string
          file_url: string
          id?: string
          updated_at?: string
          user_id: string
          verification_reason?: string | null
          verification_status?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json | null
          file_name?: string
          file_url?: string
          id?: string
          updated_at?: string
          user_id?: string
          verification_reason?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      financial_institutions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          contact_email: string
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          institution_name: string
          license_number: string
          logo_url: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          contact_email: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          institution_name: string
          license_number: string
          logo_url?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          contact_email?: string
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          institution_name?: string
          license_number?: string
          logo_url?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_contact: string | null
          client_name: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          line_items: Json
          notes: string | null
          paid_at: string | null
          share_token: string | null
          sme_user_id: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          client_contact?: string | null
          client_name: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          share_token?: string | null
          sme_user_id: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          client_contact?: string | null
          client_name?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          share_token?: string | null
          sme_user_id?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      loan_applications: {
        Row: {
          amount: number
          applied_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          fi_id: string
          id: string
          product_id: string | null
          purpose: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          applied_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          fi_id: string
          id?: string
          product_id?: string | null
          purpose?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          applied_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          fi_id?: string
          id?: string
          product_id?: string | null
          purpose?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_fi_id_fkey"
            columns: ["fi_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_products"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          fi_id: string
          id: string
          interest_rate: number
          max_amount: number
          min_amount: number
          min_credit_score: number
          name: string
          requirements: string | null
          term_months: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          fi_id: string
          id?: string
          interest_rate: number
          max_amount: number
          min_amount?: number
          min_credit_score?: number
          name: string
          requirements?: string | null
          term_months: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          fi_id?: string
          id?: string
          interest_rate?: number
          max_amount?: number
          min_amount?: number
          min_credit_score?: number
          name?: string
          requirements?: string | null
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_products_fi_id_fkey"
            columns: ["fi_id"]
            isOneToOne: false
            referencedRelation: "financial_institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_requests: {
        Row: {
          accepted_bid_id: string | null
          amount: number
          borrower_id: string
          collateral_asset_id: string | null
          created_at: string
          id: string
          max_interest_rate: number
          purpose: string
          status: string
          term_months: number
          updated_at: string
        }
        Insert: {
          accepted_bid_id?: string | null
          amount: number
          borrower_id: string
          collateral_asset_id?: string | null
          created_at?: string
          id?: string
          max_interest_rate: number
          purpose: string
          status?: string
          term_months: number
          updated_at?: string
        }
        Update: {
          accepted_bid_id?: string | null
          amount?: number
          borrower_id?: string
          collateral_asset_id?: string | null
          created_at?: string
          id?: string
          max_interest_rate?: number
          purpose?: string
          status?: string
          term_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      manual_review_requests: {
        Row: {
          admin_id: string | null
          admin_response: string | null
          created_at: string
          current_score: number | null
          id: string
          reason: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          admin_response?: string | null
          created_at?: string
          current_score?: number | null
          id?: string
          reason: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          admin_response?: string | null
          created_at?: string
          current_score?: number | null
          id?: string
          reason?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: number
          max_interest_rate_cap: number
          max_loan_amount: number
          min_loan_amount: number
          updated_at: string
          updated_by: string | null
          withdrawal_fee_pct: number
        }
        Insert: {
          id?: number
          max_interest_rate_cap?: number
          max_loan_amount?: number
          min_loan_amount?: number
          updated_at?: string
          updated_by?: string | null
          withdrawal_fee_pct?: number
        }
        Update: {
          id?: number
          max_interest_rate_cap?: number
          max_loan_amount?: number
          min_loan_amount?: number
          updated_at?: string
          updated_by?: string | null
          withdrawal_fee_pct?: number
        }
        Relationships: []
      }
      pledges: {
        Row: {
          amount: number
          campaign_id: string
          created_at: string
          escrow_ledger_id: string | null
          id: string
          investor_id: string
          status: string
        }
        Insert: {
          amount: number
          campaign_id: string
          created_at?: string
          escrow_ledger_id?: string | null
          id?: string
          investor_id: string
          status?: string
        }
        Update: {
          amount?: number
          campaign_id?: string
          created_at?: string
          escrow_ledger_id?: string | null
          id?: string
          investor_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pledges_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          national_id_back_url: string | null
          national_id_front_url: string | null
          passport_photo_url: string | null
          updated_at: string
          user_id: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          national_id_back_url?: string | null
          national_id_front_url?: string | null
          passport_photo_url?: string | null
          updated_at?: string
          user_id: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          national_id_back_url?: string | null
          national_id_front_url?: string | null
          passport_photo_url?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          client_contact: string | null
          client_name: string
          created_at: string
          id: string
          line_items: Json
          notes: string | null
          quotation_number: string
          share_token: string | null
          sme_user_id: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_contact?: string | null
          client_name: string
          created_at?: string
          id?: string
          line_items?: Json
          notes?: string | null
          quotation_number: string
          share_token?: string | null
          sme_user_id: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_contact?: string | null
          client_name?: string
          created_at?: string
          id?: string
          line_items?: Json
          notes?: string | null
          quotation_number?: string
          share_token?: string | null
          sme_user_id?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      repayment_schedule: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          due_date: string
          id: string
          loan_id: string
          paid_at: string | null
          reminder_24h_sent: boolean
          reminder_48h_sent: boolean
          source: string
          status: string
          user_id: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          created_at?: string
          due_date: string
          id?: string
          loan_id: string
          paid_at?: string | null
          reminder_24h_sent?: boolean
          reminder_48h_sent?: boolean
          source: string
          status?: string
          user_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          due_date?: string
          id?: string
          loan_id?: string
          paid_at?: string | null
          reminder_24h_sent?: boolean
          reminder_48h_sent?: boolean
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      score_access_requests: {
        Row: {
          access_level: number
          created_at: string
          expires_at: string | null
          id: string
          purpose: string | null
          requester_id: string | null
          requester_label: string
          responded_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          access_level: number
          created_at?: string
          expires_at?: string | null
          id?: string
          purpose?: string | null
          requester_id?: string | null
          requester_label: string
          responded_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          access_level?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          purpose?: string | null
          requester_id?: string | null
          requester_label?: string
          responded_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      score_share_links: {
        Row: {
          access_level: number
          created_at: string
          expires_at: string | null
          id: string
          recipient_label: string
          revoked: boolean
          token: string
          user_id: string
          view_count: number
        }
        Insert: {
          access_level: number
          created_at?: string
          expires_at?: string | null
          id?: string
          recipient_label: string
          revoked?: boolean
          token: string
          user_id: string
          view_count?: number
        }
        Update: {
          access_level?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          recipient_label?: string
          revoked?: boolean
          token?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          consent_type: string
          granted: boolean
          granted_at: string
          id: string
          revoked_at: string | null
          user_id: string
          version: string
        }
        Insert: {
          consent_type: string
          granted: boolean
          granted_at?: string
          id?: string
          revoked_at?: string | null
          user_id: string
          version?: string
        }
        Update: {
          consent_type?: string
          granted?: boolean
          granted_at?: string
          id?: string
          revoked_at?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          low_balance_threshold: number | null
          onboarding_completed: boolean
          pin_hash: string | null
          preferred_language: string
          security_a1_hash: string | null
          security_a2_hash: string | null
          security_q1: string | null
          security_q2: string | null
          updated_at: string
          user_id: string
          wallet_frozen: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          low_balance_threshold?: number | null
          onboarding_completed?: boolean
          pin_hash?: string | null
          preferred_language?: string
          security_a1_hash?: string | null
          security_a2_hash?: string | null
          security_q1?: string | null
          security_q2?: string | null
          updated_at?: string
          user_id: string
          wallet_frozen?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          low_balance_threshold?: number | null
          onboarding_completed?: boolean
          pin_hash?: string | null
          preferred_language?: string
          security_a1_hash?: string | null
          security_a2_hash?: string | null
          security_q1?: string | null
          security_q2?: string | null
          updated_at?: string
          user_id?: string
          wallet_frozen?: boolean
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          counterparty_user_id: string | null
          created_at: string
          description: string
          direction: string
          entry_type: string
          id: string
          locked_after: number
          metadata: Json | null
          reference: string | null
          related_bid_id: string | null
          related_campaign_id: string | null
          related_loan_id: string | null
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          counterparty_user_id?: string | null
          created_at?: string
          description: string
          direction: string
          entry_type: string
          id?: string
          locked_after: number
          metadata?: Json | null
          reference?: string | null
          related_bid_id?: string | null
          related_campaign_id?: string | null
          related_loan_id?: string | null
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          counterparty_user_id?: string | null
          created_at?: string
          description?: string
          direction?: string
          entry_type?: string
          id?: string
          locked_after?: number
          metadata?: Json | null
          reference?: string | null
          related_bid_id?: string | null
          related_campaign_id?: string | null
          related_loan_id?: string | null
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          locked_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          locked_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_bid: { Args: { _bid_id: string }; Returns: undefined }
      delete_my_account: { Args: { _confirm: string }; Returns: undefined }
      export_my_data: { Args: never; Returns: Json }
      get_shared_score: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id: string
          _target_type: string
        }
        Returns: string
      }
      mark_reminders_due: { Args: never; Returns: undefined }
      place_bid: {
        Args: {
          _amount: number
          _interest_rate: number
          _request_id: string
          _term_months: number
        }
        Returns: string
      }
      pledge_to_campaign: {
        Args: { _amount: number; _campaign_id: string }
        Returns: string
      }
      post_ledger: {
        Args: {
          _amount: number
          _bid_id?: string
          _campaign_id?: string
          _counterparty?: string
          _description: string
          _direction: string
          _entry_type: string
          _loan_id?: string
          _metadata?: Json
          _reference?: string
          _user_id: string
        }
        Returns: string
      }
      raise_dispute: {
        Args: {
          _description: string
          _dispute_type: string
          _related_id?: string
          _respondent_id?: string
          _subject: string
        }
        Returns: string
      }
      refund_campaign: { Args: { _campaign_id: string }; Returns: undefined }
      release_campaign_funds: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      repay_installment: { Args: { _schedule_id: string }; Returns: undefined }
      resolve_dispute: {
        Args: { _dispute_id: string; _response: string; _status: string }
        Returns: undefined
      }
      respond_score_access: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      update_platform_settings: {
        Args: {
          _max_loan: number
          _min_loan: number
          _rate_cap: number
          _withdrawal_fee: number
        }
        Returns: undefined
      }
      wallet_deposit: {
        Args: { _amount: number; _method: string; _reference?: string }
        Returns: string
      }
      wallet_withdraw: {
        Args: { _amount: number; _destination: string; _method: string }
        Returns: string
      }
      withdraw_bid: { Args: { _bid_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "financial_institution"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "financial_institution"],
    },
  },
} as const
