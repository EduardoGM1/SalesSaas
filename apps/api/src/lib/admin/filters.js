export function parseAdminFilters(sp = {}) {
  const pick = (k) => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    from: pick("from"),
    to: pick("to"),
    userId: pick("user"),
    status: pick("status"),
  };
}

export function parseUserAdminFilters(sp = {}) {
  const pick = (k) => {
    const v = sp[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const state = pick("state");
  return {
    q: pick("q"),
    role: pick("role"),
    state: state === "active" || state === "inactive" ? state : undefined,
  };
}
