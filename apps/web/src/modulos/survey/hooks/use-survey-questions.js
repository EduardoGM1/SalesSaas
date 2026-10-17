import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { loadMergedSurveyQuestions } from "../api/survey-questions-api.js";
import {
  fallbackGroupedQuestions,
  groupResolvedQuestions,
  mergeSurveyQuestions,
} from "../fachada-preguntas.js";
import {
  canConfigureSurveyQuestions,
  PERMISO_SURVEY_CONFIGURAR_PREGUNTAS,
} from "./can-configure-survey-questions.js";

export {
  canConfigureSurveyQuestions,
  PERMISO_SURVEY_CONFIGURAR_PREGUNTAS,
};

export function useSurveyQuestions() {
  const { can, profile } = useUserPermissions();
  const { active } = useWorkspace();
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
      const { bank: b, overrides: o } = await loadMergedSurveyQuestions({
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

  const canConfigure = useMemo(
    () => canConfigureSurveyQuestions({ activeWorkspace: active, can }),
    [active, can],
  );

  return {
    loading,
    userId,
    profile,
    canConfigure,
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
