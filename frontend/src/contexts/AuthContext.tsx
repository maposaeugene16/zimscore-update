import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  verification_status: string;
  passport_photo_url: string | null;
  national_id_front_url: string | null;
  national_id_back_url: string | null;
}

export interface FIInstitution {
  id: string;
  user_id: string;
  institution_name: string;
  license_number: string;
  contact_email: string;
  contact_phone: string | null;
  description: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  fi: FIInstitution | null;
  loading: boolean;
  isAdmin: boolean;
  isFI: boolean;
  refreshFI: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  fi: null,
  loading: true,
  isAdmin: false,
  isFI: false,
  refreshFI: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fi, setFi] = useState<FIInstitution | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    setProfile(data);
  };

  const fetchFI = async (userId: string) => {
    const { data } = await supabase
      .from("financial_institutions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setFi((data as FIInstitution) || null);
  };

  const checkAdminRole = async (u: User) => {
    if (u.email === "mapseujers@gmail.com") { setIsAdmin(true); return; }
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", u.id).eq("role", "admin").maybeSingle();
    setIsAdmin(!!data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
          checkAdminRole(session.user);
          fetchFI(session.user.id);
        }, 0);
      } else {
        setProfile(null); setFi(null); setIsAdmin(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        checkAdminRole(session.user);
        fetchFI(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshFI = async () => {
    if (user) await fetchFI(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null); setUser(null); setProfile(null); setFi(null); setIsAdmin(false);
  };

  const isFI = !!fi && fi.status === "approved";

  return (
    <AuthContext.Provider value={{ session, user, profile, fi, loading, isAdmin, isFI, refreshFI, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
