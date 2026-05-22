import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, Mail, Lock, Phone, FileText, Loader2, TrendingUp, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function FIRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    institutionName: "",
    licenseNumber: "",
    contactEmail: "",
    contactPhone: "",
    description: "",
    password: "",
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const { institutionName, licenseNumber, contactEmail, password } = form;
    if (!institutionName || !licenseNumber || !contactEmail || password.length < 6) {
      toast.error("Please fill in all required fields (password ≥ 6 chars)");
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: contactEmail,
        password,
        options: { data: { full_name: institutionName }, emailRedirectTo: window.location.origin },
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("Signup failed");

      // Create minimal profile
      await supabase.from("profiles").insert({
        user_id: userId,
        full_name: institutionName,
        verification_status: "verified", // FIs use institutional KYC instead
      });

      const { error: fiError } = await supabase.from("financial_institutions").insert({
        user_id: userId,
        institution_name: institutionName,
        license_number: licenseNumber,
        contact_email: contactEmail,
        contact_phone: form.contactPhone || null,
        description: form.description || null,
        status: "pending",
      });
      if (fiError) throw fiError;

      toast.success("Registration submitted. Awaiting admin approval.", {
        description: "You'll get access to your FI dashboard once approved.",
      });
      await supabase.auth.signOut();
      navigate("/login");
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen page-gradient flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center glow-primary">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold">ZimScore</span>
          </Link>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2 justify-center">
            <Building2 className="w-6 h-6 text-primary" /> Register as Financial Institution
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Submit your details for admin review</p>
        </div>

        <div className="glass-card p-6 space-y-4">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-muted-foreground">Your application will be reviewed by a ZimScore admin. Once approved, you can publish loan products and review borrower applications.</p>
          </div>

          <div className="space-y-2">
            <Label>Institution Name *</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={form.institutionName} onChange={(e) => set("institutionName", e.target.value)} className="pl-9" placeholder="e.g. Harare Microfinance" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>License / Registration Number *</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} className="pl-9" placeholder="RBZ/MFI/123" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contact Email *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className="pl-9" placeholder="loans@institution.co.zw" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contact Phone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className="pl-9" placeholder="+263 77 123 4567" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>About Your Institution</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief description of services, target customers, etc." />
          </div>

          <div className="space-y-2">
            <Label>Account Password *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="pl-9" placeholder="••••••••" />
            </div>
          </div>

          <Button onClick={submit} disabled={loading} className="w-full glow-primary">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : "Submit Application"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already registered? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            {" · "}
            Borrower? <Link to="/register" className="text-primary hover:underline">User signup</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
