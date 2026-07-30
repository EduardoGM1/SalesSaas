import { CollabField } from "@/components/clients/collab-field.jsx";
import { SelectorMonedaCaptura } from "@/components/currency/selector-moneda-captura.jsx";
import { CampoMonedaCaptura } from "@/components/currency/campo-moneda-captura.jsx";
import { PanelTipoCambio } from "@/components/currency/panel-tipo-cambio.jsx";
import { selectOnFocus } from "@/lib/focus-select.js";

const HIST = ["sh1", "sh2", "sh3"];
const FUT = ["sf1", "sf2", "sf3"];

/** Contenido de Gastos de viaje con moneda de captura y resultados en moneda operativa. */
export function GastosPanel({
  t,
  data,
  update,
  sType,
  setSType,
  futureType,
  setFutureType,
  result,
  fmtResult,
  fmtD,
  captureCurrency,
  onCaptureCurrencyChange,
  onMoneyBlur,
  collab,
  fid,
  dirtyKeysRef,
  readOnly,
  isFileMode,
}) {
  const moneyBlur = (key) => (event) => {
    onMoneyBlur?.(key, event.target.value);
  };

  return (
    <div className="disc-panel disc-gastos-panel">
      <div className="disc-section-head">
        <div>
          <h2 className="card-heading">3. Gastos de viaje</h2>
          <p className="card-sub">
            Captura el viaje actual, sus últimas vacaciones y sus viajes futuros.
          </p>
        </div>
      </div>

      <SelectorMonedaCaptura
        value={captureCurrency}
        onChange={onCaptureCurrencyChange}
        disabled={readOnly}
        className="tool-moneda-selector"
      />
      <PanelTipoCambio disabled={readOnly} className="tool-tipo-cambio-panel" />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-heading">{t("tools.survey.currentTrip")}</div>
        <div className="card-sub">{t("tools.survey.currentTripSub")}</div>
        <div className="g2 survey-trip-grid">
          <div className="tool-calc-fields">
            <div className="frow frow-first tool-frow">
              <div className="flabel">{t("tools.survey.nights")}</div>
              <CollabField collab={collab} fieldId={fid("nights")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                {(lp) => (
                  <input type="number" inputMode="numeric" className={`input-compact tool-num-input ${lp.className || ""}`.trim()} id="sv-nights" min={1} value={data.nights} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update("nights", e.target.value)} />
                )}
              </CollabField>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("tools.survey.expenseType")}</div>
              <div className="seg">
                <button type="button" className={`seg-btn${sType === "hotel" ? " on" : ""}`} onClick={() => setSType("hotel")}>{t("tools.survey.hotelOnly")}</button>
                <button type="button" className={`seg-btn${sType === "paquete" ? " on" : ""}`} onClick={() => setSType("paquete")}>{t("tools.survey.hotelFlight")}</button>
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">{t("tools.survey.totalPaid")}</div>
              <CampoMonedaCaptura
                currency={captureCurrency}
                value={data.total}
                onChange={(value) => update("total", value)}
                onBlurCapture={moneyBlur("total")}
                collab={collab}
                fieldId={fid("total")}
                dirtyKeysRef={dirtyKeysRef}
                readOnly={readOnly}
                inputId="sv-total"
              />
            </div>
            <div id="sv-split" style={{ display: sType === "paquete" ? "block" : "none" }}>
              <div className="frow tool-frow">
                <div className="flabel">{t("tools.survey.hotelPct")}</div>
                <div className="frow-inline">
                  <CollabField collab={collab} fieldId={fid("hpct")} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                    {(lp) => (
                      <input type="number" inputMode="numeric" className={`input-compact tool-num-input ${lp.className || ""}`.trim()} id="sv-hpct" min={1} max={99} value={data.hpct} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update("hpct", e.target.value)} />
                    )}
                  </CollabField>
                  <span className="frow-suffix">%</span>
                </div>
              </div>
              <div className="g2 survey-result-pair" style={{ marginTop: 10 }}>
                <div className="vbox blue"><div className="vbox-val">{fmtResult(result.split.hval)}</div><div className="vbox-label">{t("tools.survey.splitHotel", { pct: result.split.hpct })}</div></div>
                <div className="vbox blue"><div className="vbox-val">{fmtResult(result.split.vval)}</div><div className="vbox-label">{t("tools.survey.splitFlight", { pct: 100 - result.split.hpct })}</div></div>
              </div>
            </div>
          </div>
          <div className="g2 survey-result-pair">
            <div className="vbox blue">
              <div className="vbox-val">{fmtResult(result.trip.dp)}</div>
              <div className="vbox-label">{t("tools.survey.suggestedDown")}</div>
              <div className="vbox-sub">{t("tools.survey.paidHint")}</div>
            </div>
            <div className="vbox green">
              <div className="vbox-val">{fmtResult(result.trip.mi)}</div>
              <div className="vbox-label">{t("tools.survey.idealMonthly")}</div>
              <div className="vbox-sub">{t("tools.survey.paidDiv12")}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-heading">{t("tools.survey.histTitle")}</div>
          <div className="card-sub">{t("tools.survey.histSub")}</div>
          <div className="table-scroll">
            <table className="mtbl">
              <thead><tr><th>{t("tools.survey.table.destination")}</th><th>{t("tools.survey.table.year")}</th><th>{t("tools.survey.table.nights")}</th><th>{t("tools.survey.table.amount")}</th></tr></thead>
              <tbody>
                {HIST.map((p) => (
                  <tr key={p}>
                    <td>
                      <CollabField collab={collab} fieldId={fid(`${p}c`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="text" inputMode="text" value={data[`${p}c`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}c`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}y`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}y`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}y`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}n`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}n`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}n`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="mc">
                      <CampoMonedaCaptura
                        currency={captureCurrency}
                        value={data[`${p}a`]}
                        onChange={(value) => update(`${p}a`, value)}
                        onBlurCapture={moneyBlur(`${p}a`)}
                        collab={collab}
                        fieldId={fid(`${p}a`)}
                        dirtyKeysRef={dirtyKeysRef}
                        readOnly={readOnly}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="trow">
                  <td colSpan={2} style={{ color: "var(--muted2)", fontSize: 10 }}>{t("tools.survey.totals")}</td>
                  <td>{result.hist.nights}</td>
                  <td>{fmtResult(result.hist.spend)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
            <div className="vbox blue">
              <div className="vbox-val">{fmtResult(result.hist.dp)}</div>
              <div className="vbox-label">{t("tools.survey.suggestedDown")}</div>
              <div className="vbox-sub">{t("tools.survey.histAvgSub")}</div>
            </div>
            <div className="vbox green">
              <div className="vbox-val">{fmtResult(result.hist.mi)}</div>
              <div className="vbox-label">{t("tools.survey.idealMonthly")}</div>
              <div className="vbox-sub">{t("tools.survey.histMiSub")}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="survey-future-head">
            <div>
              <div className="card-heading" style={{ marginBottom: 4 }}>{t("tools.survey.futureTitle")}</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>{t("tools.survey.futureSub")}</div>
            </div>
            <div className="choice-row" aria-label={t("tools.survey.futureTypeAria")}>
              <label className={`choice-pill${futureType === "real" ? " on" : ""}`} id="sf-real-pill">
                <input type="checkbox" id="sf-real" checked={futureType === "real"} onChange={() => setFutureType("real")} /> {t("tools.survey.realTrips")}
              </label>
              <label className={`choice-pill${futureType === "dream" ? " on" : ""}`} id="sf-dream-pill">
                <input type="checkbox" id="sf-dream" checked={futureType === "dream"} onChange={() => setFutureType("dream")} /> {t("tools.survey.dreamTrips")}
              </label>
            </div>
          </div>
          <div className="table-scroll">
            <table className="mtbl">
              <thead><tr><th>{t("tools.survey.table.destination")}</th><th>{t("tools.survey.table.year")}</th><th>{t("tools.survey.table.nights")}</th><th>{t("tools.survey.table.cost")}</th></tr></thead>
              <tbody>
                {FUT.map((p) => (
                  <tr key={p}>
                    <td>
                      <CollabField collab={collab} fieldId={fid(`${p}c`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="text" inputMode="text" value={data[`${p}c`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}c`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}y`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}y`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}y`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="nc">
                      <CollabField collab={collab} fieldId={fid(`${p}n`)} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
                        {(lp) => (
                          <input type="number" inputMode="numeric" value={data[`${p}n`]} className={lp.className} onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }} onBlur={lp.onBlur} disabled={lp.disabled} readOnly={lp.readOnly} onChange={(e) => update(`${p}n`, e.target.value)} />
                        )}
                      </CollabField>
                    </td>
                    <td className="mc">
                      <CampoMonedaCaptura
                        currency={captureCurrency}
                        value={data[`${p}a`]}
                        onChange={(value) => update(`${p}a`, value)}
                        onBlurCapture={moneyBlur(`${p}a`)}
                        collab={collab}
                        fieldId={fid(`${p}a`)}
                        dirtyKeysRef={dirtyKeysRef}
                        readOnly={readOnly}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
                <tr className="trow">
                  <td colSpan={2} style={{ color: "var(--muted2)", fontSize: 10 }}>{t("tools.survey.totals")}</td>
                  <td>{result.future.nights}</td>
                  <td>{fmtResult(result.future.spend)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="vbox yellow">
              <div className="vbox-val">{fmtResult(result.future.spend)}</div>
              <div className="vbox-label">{t("tools.survey.futureTotal")}</div>
            </div>
          </div>
        </div>
      </div>

      {!isFileMode && (
        <div className="card" id="sv-pattern-card">
          <div className="card-heading">{t("tools.survey.patternTitle")}</div>
          <div className="card-sub">{t("tools.survey.patternSub")}</div>
          <div className="table-scroll">
            <table className="dtbl pattern-table">
              <thead>
                <tr>
                  <th>{t("tools.survey.pattern.source")}</th>
                  <th className="td-r">{t("tools.survey.pattern.vacYear")}</th>
                  <th className="td-r">{t("tools.survey.pattern.nightsYear")}</th>
                  <th className="td-r">{t("tools.survey.pattern.down")}</th>
                  <th className="td-r">{t("tools.survey.pattern.monthly")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t("tools.survey.pattern.current")}</td>
                  <td className="td-r td-blue">{result.current.vac}</td>
                  <td className="td-r td-blue">{fmtD(result.current.night)}</td>
                  <td className="td-r td-blue">{fmtResult(result.current.dp)}</td>
                  <td className="td-r td-green">{fmtResult(result.current.mi)}</td>
                </tr>
                <tr>
                  <td>{t("tools.survey.pattern.hist")}</td>
                  <td className="td-r td-blue">{fmtD(result.hist.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.hist.night)}</td>
                  <td className="td-r td-blue">{fmtResult(result.hist.dp)}</td>
                  <td className="td-r td-green">{fmtResult(result.hist.mi)}</td>
                </tr>
                <tr>
                  <td>{t("tools.survey.pattern.future")}</td>
                  <td className="td-r td-blue">{fmtD(result.future.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.future.night)}</td>
                  <td className="td-r td-blue">{fmtResult(result.future.dp)}</td>
                  <td className="td-r td-green">{fmtResult(result.future.mi)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td>{t("tools.survey.pattern.blend")}</td>
                  <td className="td-r td-blue">{fmtD(result.pattern.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.pattern.night)}</td>
                  <td className="td-r td-blue">{fmtResult(result.pattern.dp)}</td>
                  <td className="td-r td-green">{fmtResult(result.pattern.mi)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
