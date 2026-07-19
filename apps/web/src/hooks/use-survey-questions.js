import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { loadMergedSurveyQuestions } from "@/lib/survey/survey-questions-api.js";
import {
  fallbackGroupedQuestions,
  groupResolvedQuestions,
  mergeSurveyQuestions,
} from "@/lib/survey/resolve-survey-questions.js";

export function useSurveyQuestions() {
  const { can, profile } = useUserPermissions();
  const [userId, setUserId] = useState(null);
  const [bank, setBank] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setUserId(null);
      return undefined;
    }
    return watchSession((session) => {
      setUserId(session?.user?.id ?? session?.profile?.id ?? null);
    });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { bank: b, overrides: o } = await loadMergedSurveyQuestions(userId, {
        includeInactive: true,
      });
      setBank(b);
      setOverrides(o);
      setRevision((r) => r + 1);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mergedAll = useMemo(
    () => mergeSurveyQuestions(bank, overrides, { includeInactive: true }),
    [bank, overrides, revision],
  );

  const mergedActive = useMemo(
    () => mergedAll.filter((r) => r.activa),
    [mergedAll],
  );

  const grouped = useMemo(() => {
    if (!mergedActive.length) return fallbackGroupedQuestions();
    return groupResolvedQuestions(mergedActive);
  }, [mergedActive]);

  return {
    loading,
    userId,
    profile,
    canConfigure: can("herramientas:survey_configurar_preguntas"),
    bank,
    overrides,
    mergedAll,
    mergedActive,
    grouped,
    progressIds: grouped.progressIds,
    reload,
    setLocalOverrides: setOverrides,
  };
}
