import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, AlertCircle } from "lucide-react";

export default function SharedScore() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("get_shared_score", { _token: token });
      if (error) setData({ error: error.message });
      else setData(data);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  const err = data?.error;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="glass-card p-8 max-w-md w-full text-center space-y-4">
        {err ? (
          <>
            <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="font-display text-xl font-bold">Link {err}</h1>
            <p className="text-sm text-muted-foreground">This share link is no longer valid.</p>
          </>
        ) : (
          <>
            <ShieldCheck className="w-12 h-12 text-success mx-auto" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Verified ZimScore for</p>
            <h1 className="font-display text-xl font-bold">{data.recipient_label}</h1>
            <div className="py-6">
              <p className="font-display text-6xl font-bold text-primary">{data.score ?? "—"}</p>
              <p className="text-lg text-muted-foreground mt-2">{data.band}</p>
            </div>
            {data.verified_documents != null && (
              <p className="text-sm text-muted-foreground">Based on {data.verified_documents} verified document(s)</p>
            )}
            {data.expires_at && (
              <p className="text-xs text-muted-foreground">Expires {new Date(data.expires_at).toLocaleDateString("en-GB")}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
