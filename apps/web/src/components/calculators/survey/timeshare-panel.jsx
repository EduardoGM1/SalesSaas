import { useI18n } from "@/hooks/use-i18n.js";
import { ChipQuestion } from "./chip-question.jsx";
import { MembershipTable } from "./membership-table.jsx";

export function TimesharePanel({
  discovery,
  disabled,
  onPatch,
  onConfigClick,
  canConfigure = false,
  timeshareQuestions = [],
  hasTsQuestion = null,
}) {
  const { t } = useI18n();
  const answers = discovery.answers || {};
  const contexts = discovery.contexts || {};

  const setSelected = (id, next) => {
    onPatch({ answers: { ...answers, [id]: next } });
  };

  const setContext = (id, value) => {
    onPatch({ contexts: { ...contexts, [id]: value } });
  };

  return (
    <div className="disc-panel">
      <div className="disc-section-head">
        <div>
          <h2 className="card-heading">{t("survey.disc.section.timeshare.title")}</h2>
          <p className="card-sub">{t("survey.disc.section.timeshare.sub")}</p>
        </div>
        {canConfigure && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={disabled}
            onClick={onConfigClick}
          >
            {t("survey.disc.configQuestions")}
          </button>
        )}
      </div>

      <div className="disc-questions">
        {timeshareQuestions.map((q) => (
          <ChipQuestion
            key={q.id}
            question={q}
            selected={answers[q.id] || []}
            context={contexts[q.id] || ""}
            disabled={disabled}
            onChangeSelected={(sel) => setSelected(q.id, sel)}
            onChangeContext={(v) => setContext(q.id, v)}
          />
        ))}
      </div>

      <div className="disc-subsection-head">
        <div>
          <h2 className="card-heading">{t("survey.disc.membership.title")}</h2>
          <p className="card-sub">{t("survey.disc.membership.sub")}</p>
        </div>
      </div>

      {hasTsQuestion && (
        <div className="disc-questions">
          <ChipQuestion
            question={hasTsQuestion}
            selected={discovery.hasTs ? [discovery.hasTs] : []}
            disabled={disabled}
            showNumber={false}
            onChangeSelected={(sel) => onPatch({ hasTs: sel[0] || "" })}
          />
        </div>
      )}

      <MembershipTable
        rows={discovery.memberships || []}
        disabled={disabled}
        onChange={(memberships) => onPatch({ memberships })}
      />
    </div>
  );
}
