import { COUNTRY_CITY, COUNTRY_FLAGS } from "@/lib/constants";
import { selectOnFocus } from "@/lib/focus-select.js";
import { useI18n } from "@/hooks/use-i18n.js";

/** Selectores de país y ciudad (mismo catálogo que la encuesta). */
export function CountryCitySelects({
  country = "",
  city = "",
  onChange,
  fieldClassName = "prospect-field",
  countryLabelKey = "exp.edit.country",
  cityLabelKey = "exp.edit.city",
}) {
  const { t } = useI18n();
  const countries = Object.keys(COUNTRY_CITY);
  const cities = COUNTRY_CITY[country || ""] || ["Otro"];

  return (
    <div className="prospect-geo-row">
      <div className={fieldClassName}>
        <label>{t(countryLabelKey)}</label>
        <select
          value={country || ""}
          onFocus={selectOnFocus}
          onChange={(e) => onChange({ country: e.target.value, city: "" })}
        >
          <option value="">{t("tools.survey.selectCountry")}</option>
          {countries.map((name) => (
            <option key={name} value={name}>
              {COUNTRY_FLAGS[name] || "🌐"} {name}
            </option>
          ))}
          {country && !countries.includes(country) && (
            <option value={country}>{country}</option>
          )}
        </select>
      </div>
      <div className={fieldClassName}>
        <label>{t(cityLabelKey)}</label>
        <select
          value={city || ""}
          onFocus={selectOnFocus}
          onChange={(e) => onChange({ city: e.target.value })}
          disabled={!country}
        >
          <option value="">{t("tools.survey.selectCity")}</option>
          {cities.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
          {city && !cities.includes(city) && (
            <option value={city}>{city}</option>
          )}
        </select>
      </div>
    </div>
  );
}
