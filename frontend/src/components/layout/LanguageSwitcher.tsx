import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGS = [
  { code: "en", labelKey: "settings.english" },
  { code: "sn", labelKey: "settings.shona" },
  { code: "nd", labelKey: "settings.ndebele" },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();

  // Load persisted language from DB on auth
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.preferred_language && data.preferred_language !== i18n.language) {
          i18n.changeLanguage(data.preferred_language);
        }
      });
  }, [user, i18n]);

  const change = async (code: string) => {
    i18n.changeLanguage(code);
    if (user) {
      await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, preferred_language: code }, { onConflict: "user_id" });
    }
  };

  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground text-xs font-medium uppercase">
        <Globe className="w-4 h-4" />
        {current.code}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => change(l.code)}>
            {t(l.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
