
import { useEffect, useState } from "react";
import { _registerConfirm } from "@/lib/confirm";
import { useI18n } from "@/hooks/use-i18n.js";

type State = { msg; resolve: (ok: boolean) => void };

export function ConfirmDialog() {
  const { t } = useI18n();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    _registerConfirm((msg, resolve) => setState({ msg, resolve }));
  }, []);

  if (!state) return null;

  const respond = (ok: boolean) => {
    state.resolve(ok);
    setState(null);
  };

  return (
    <>
      <div className="modal-backdrop" onClick={() => respond(false)} />
      <div className="confirm-dialog" role="alertdialog" aria-modal="true">
        <div className="confirm-msg">{state.msg}</div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => respond(false)}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => respond(true)}>
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </>
  );
}
