import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, UserRound } from "lucide-react";
import { adminJson } from "@/lib/admin/api.js";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const VIEW_PAD = 8;
const GAP = 4;
const MAX_DROPDOWN_HEIGHT = 260;

function formatUser(user) {
  if (!user) return "";
  if (user.full_name && user.email) return `${user.full_name} — ${user.email}`;
  return user.full_name || user.email || "";
}

function isRectVisible(rect) {
  return rect.bottom > VIEW_PAD
    && rect.top < window.innerHeight - VIEW_PAD
    && rect.right > VIEW_PAD
    && rect.left < window.innerWidth - VIEW_PAD;
}

function computeDropdownCoords(anchorRect, menuHeight = MAX_DROPDOWN_HEIGHT) {
  const width = Math.min(anchorRect.width, window.innerWidth - VIEW_PAD * 2);
  let left = anchorRect.left;
  if (left + width > window.innerWidth - VIEW_PAD) {
    left = Math.max(VIEW_PAD, window.innerWidth - width - VIEW_PAD);
  }
  if (left < VIEW_PAD) left = VIEW_PAD;

  const spaceBelow = window.innerHeight - anchorRect.bottom - GAP - VIEW_PAD;
  const spaceAbove = anchorRect.top - GAP - VIEW_PAD;
  const preferredHeight = Math.min(MAX_DROPDOWN_HEIGHT, menuHeight || MAX_DROPDOWN_HEIGHT);

  let top;
  let maxHeight;
  if (spaceBelow >= Math.min(preferredHeight, 120) || spaceBelow >= spaceAbove) {
    top = anchorRect.bottom + GAP;
    maxHeight = Math.min(MAX_DROPDOWN_HEIGHT, Math.max(80, spaceBelow));
  } else {
    maxHeight = Math.min(MAX_DROPDOWN_HEIGHT, Math.max(80, spaceAbove));
    top = Math.max(VIEW_PAD, anchorRect.top - GAP - maxHeight);
  }

  return { top, left, width, maxHeight };
}

async function fetchV1Search(searchPath, query, signal) {
  const res = await fetch(`/api/v1/${searchPath}?q=${encodeURIComponent(query)}`, {
    credentials: "include",
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "No fue posible buscar usuarios.");
  return payload.data ?? payload;
}

/**
 * Buscador con autocompletado por nombre o correo.
 * - Con `empresaId`: usuarios asignables de la empresa (panel admin tenant).
 * - Con `searchPath`: búsqueda vía `/api/v1/{searchPath}?q=` (p. ej. invitar a sala).
 */
export function BuscadorUsuario({
  empresaId,
  searchPath = null,
  value,
  onChange,
  placeholder = "Nombre o correo del usuario",
  disabled = false,
  inputId,
}) {
  const listId = useId();
  const anchorRef = useRef(null);
  const dropdownRef = useRef(null);
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, maxHeight: MAX_DROPDOWN_HEIGHT });
  const skipSync = useRef(false);
  const abortRef = useRef(null);
  const blurTimer = useRef(null);

  const showEmpty = open && !loading && Array.isArray(results) && results.length === 0;
  const showList = open && Array.isArray(results) && results.length > 0;
  const showDropdown = open && !value && (loading || showList || showEmpty);

  const placeDropdown = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (!isRectVisible(rect)) {
      setOpen(false);
      return;
    }
    const menuHeight = dropdownRef.current?.offsetHeight || MAX_DROPDOWN_HEIGHT;
    setCoords(computeDropdownCoords(rect, menuHeight));
  };

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
    if (query.length < MIN_CHARS || (!searchPath && !empresaId)) {
      setResults(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const loader = searchPath
        ? fetchV1Search(searchPath, query, controller.signal)
        : adminJson(`tenant/empresas/${empresaId}/users/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      loader
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
  }, [text, value, empresaId, searchPath]);

  useLayoutEffect(() => {
    if (!showDropdown) return;
    placeDropdown();
  }, [showDropdown, results, loading]);

  useEffect(() => {
    if (!showDropdown) return undefined;
    const onScrollOrResize = () => placeDropdown();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [showDropdown]);

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

  const portalStyle = {
    top: coords.top,
    left: coords.left,
    width: coords.width,
    maxHeight: coords.maxHeight,
  };

  const dropdownPortal = showDropdown && typeof document !== "undefined"
    ? createPortal(
        loading ? (
          <div
            ref={dropdownRef}
            id={listId}
            className="buscador-usuario-hint buscador-usuario-portal"
            style={portalStyle}
            role="status"
            onMouseDown={(event) => event.preventDefault()}
          >
            Buscando…
          </div>
        ) : showList ? (
          <ul
            ref={dropdownRef}
            id={listId}
            className="buscador-usuario-list buscador-usuario-portal"
            style={portalStyle}
            role="listbox"
            onMouseDown={(event) => event.preventDefault()}
          >
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
        ) : (
          <div
            ref={dropdownRef}
            id={listId}
            className="buscador-usuario-list buscador-usuario-empty buscador-usuario-portal"
            style={portalStyle}
            role="status"
            onMouseDown={(event) => event.preventDefault()}
          >
            No se encontraron usuarios con ese nombre o correo.
          </div>
        ),
        document.body,
      )
    : null;

  return (
    <div className="buscador-usuario">
      <div className="buscador-usuario-field" ref={anchorRef}>
        <Search size={15} aria-hidden />
        <input
          id={inputId}
          className="auth-input"
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listId : undefined}
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
      {dropdownPortal}
    </div>
  );
}
