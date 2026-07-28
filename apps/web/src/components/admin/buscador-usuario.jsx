import { useEffect, useRef, useState } from "react";
import { Search, UserRound } from "lucide-react";
import { adminJson } from "@/lib/admin/api.js";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

function formatUser(user) {
  if (!user) return "";
  if (user.full_name && user.email) return `${user.full_name} — ${user.email}`;
  return user.full_name || user.email || "";
}

/**
 * Buscador con autocompletado por nombre o correo, acotado a la empresa activa.
 * Guarda el usuario completo (con `id`) vía `onChange`; el texto visible es solo presentación.
 */
export function BuscadorUsuario({ empresaId, value, onChange, placeholder = "Nombre o correo del usuario", disabled = false, inputId }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skipSync = useRef(false);
  const abortRef = useRef(null);
  const blurTimer = useRef(null);

  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    setText(formatUser(value));
    if (!value) setResults(null);
  }, [value]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  useEffect(() => {
    if (value) return undefined;
    const query = text.trim();
    if (query.length < MIN_CHARS) {
      setResults(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      adminJson(`tenant/empresas/${empresaId}/users/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((rows) => {
          setResults(Array.isArray(rows) ? rows : []);
          setOpen(true);
          setLoading(false);
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          setResults([]);
          setOpen(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value, empresaId]);

  const handleInput = (event) => {
    setText(event.target.value);
    if (value) {
      skipSync.current = true;
      onChange(null);
    }
  };

  const select = (user) => {
    onChange(user);
    setOpen(false);
    setResults(null);
  };

  const showEmpty = open && !loading && Array.isArray(results) && results.length === 0;
  const showList = open && Array.isArray(results) && results.length > 0;

  return (
    <div className="buscador-usuario">
      <div className="buscador-usuario-field">
        <Search size={15} aria-hidden />
        <input
          id={inputId}
          className="auth-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          required
          onChange={handleInput}
          onFocus={() => { if (results) setOpen(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        />
      </div>
      {loading && !value ? <div className="buscador-usuario-hint">Buscando…</div> : null}
      {showList ? (
        <ul className="buscador-usuario-list" role="listbox">
          {results.map((user) => (
            <li key={user.id}>
              <button type="button" role="option" aria-selected={false} onMouseDown={(event) => { event.preventDefault(); select(user); }}>
                <span className="buscador-usuario-avatar" aria-hidden>
                  {user.avatar_url ? <img src={user.avatar_url} alt="" /> : <UserRound size={14} />}
                </span>
                <span className="buscador-usuario-texts">
                  <strong>{user.full_name || user.email}</strong>
                  {user.full_name && user.email ? <span>{user.email}</span> : null}
                </span>
                {user.en_empresa ? <span className="buscador-usuario-tag">En tu empresa</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showEmpty ? (
        <div className="buscador-usuario-list buscador-usuario-empty" role="status">
          No se encontraron usuarios con ese nombre o correo.
        </div>
      ) : null}
    </div>
  );
}
