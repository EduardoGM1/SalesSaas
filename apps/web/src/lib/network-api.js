async function apiFetch(path, options = {}) {
  const { headers, cache, ...rest } = options;
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    cache: cache ?? "default",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    ...rest,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error de red.");
  return body.data ?? body;
}

export const networkApi = {
  searchUsers: (q) => apiFetch(`/network/users/search?q=${encodeURIComponent(q)}`),
  listConnections: (status) => apiFetch(`/network/connections${status ? `?status=${status}` : ""}`),
  getContact: (contactId) => apiFetch(`/network/contacts/${contactId}`),
  listSharesWithContact: (contactId) => apiFetch(`/network/contacts/${contactId}/shares`),
  sendRequest: (addresseeId) => apiFetch("/network/connections", {
    method: "POST",
    body: JSON.stringify({ addressee_id: addresseeId }),
  }),
  updateConnection: (id, status) => apiFetch(`/network/connections/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }),
  removeConnection: (id) => apiFetch(`/network/connections/${id}`, { method: "DELETE" }),
};

export const messagesApi = {
  conversations: () => apiFetch("/messages/conversations", { cache: "no-store" }),
  thread: (userId) => apiFetch(`/messages?with=${encodeURIComponent(userId)}`, { cache: "no-store" }),
  send: (recipientId, body) => apiFetch("/messages", {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({ recipient_id: recipientId, body }),
  }),
  markRead: (userId) => apiFetch(`/messages/read?with=${encodeURIComponent(userId)}`, {
    method: "PATCH",
    cache: "no-store",
  }),
  unreadCount: () => apiFetch("/messages/unread-count", { cache: "no-store" }),
};

export const sharingApi = {
  listReceived: () => apiFetch("/shares/received"),
  getSharedProspect: (prospectId) => apiFetch(`/shared-prospects/${prospectId}`),
  getTool: (prospectId, tool) => apiFetch(`/shared-prospects/${prospectId}/tools/${tool}`),
  saveTool: (prospectId, tool, data) => apiFetch(`/shared-prospects/${prospectId}/tools/${tool}`, {
    method: "PUT",
    body: JSON.stringify({ data }),
  }),
  listForProspect: (prospectId) => apiFetch(`/prospects/${prospectId}/shares`),
  create: (prospectId, sharedWithId, permission, extras = {}) => apiFetch(`/prospects/${prospectId}/shares`, {
    method: "POST",
    body: JSON.stringify({
      shared_with_id: sharedWithId,
      permission,
      puede_volver_a_compartir: extras.puede_volver_a_compartir === true,
    }),
  }),
  createInvite: (prospectId, permission = "view") => apiFetch(`/prospects/${prospectId}/share-invites`, {
    method: "POST",
    body: JSON.stringify({ permission }),
  }),
  redeemInvite: (token) => apiFetch(`/share-invites/${encodeURIComponent(token)}/redeem`, {
    method: "POST",
    body: JSON.stringify({}),
  }),
  listWorkspace: () => apiFetch("/shares/workspace"),
  addToWorkspace: (shareId) => apiFetch(`/shares/${shareId}/add-to-workspace`, {
    method: "POST",
    body: JSON.stringify({}),
  }),
  requestPermission: (shareId, toPermission = "edit") => apiFetch(`/shares/${shareId}/permission-requests`, {
    method: "POST",
    body: JSON.stringify({ to_permission: toPermission }),
  }),
  decidePermission: (requestId, decision) => apiFetch(`/share-permission-requests/${requestId}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  }),
  updatePermission: (shareId, permission, extras = {}) => apiFetch(`/shares/${shareId}`, {
    method: "PATCH",
    body: JSON.stringify({
      permission,
      ...(extras.puede_volver_a_compartir !== undefined
        ? { puede_volver_a_compartir: extras.puede_volver_a_compartir === true }
        : {}),
    }),
  }),
  remove: (shareId) => apiFetch(`/shares/${shareId}`, { method: "DELETE" }),
  updateProspect: (prospectId, body) => apiFetch(`/shared-prospects/${prospectId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }),
  duplicate: (prospectId, opts = {}) => apiFetch(`/prospects/${prospectId}/duplicate`, {
    method: "POST",
    body: JSON.stringify(opts),
  }),
  transfer: (prospectId, toUserId) => apiFetch(`/prospects/${prospectId}/transfer`, {
    method: "POST",
    body: JSON.stringify({ to_user_id: toUserId }),
  }),
  listAudit: (prospectId, limit = 50) => apiFetch(`/prospects/${prospectId}/audit?limit=${limit}`),
};

export const workspacesApi = {
  list: () => apiFetch("/workspaces"),
  setActive: (workspaceId) => apiFetch("/workspaces/active", {
    method: "PATCH",
    body: JSON.stringify({ workspace_id: workspaceId }),
  }),
  createOrg: (nombre) => apiFetch("/organizaciones", {
    method: "POST",
    body: JSON.stringify({ nombre }),
  }),
  createSala: (nombre, organizacionId) => apiFetch("/workspaces/salas", {
    method: "POST",
    body: JSON.stringify({ nombre, organizacion_id: organizacionId }),
  }),
  listMembers: (workspaceId) => apiFetch(`/workspaces/${workspaceId}/members`),
  addMember: (workspaceId, usuarioId, rol = "vendedor") => apiFetch(`/workspaces/${workspaceId}/members`, {
    method: "POST",
    body: JSON.stringify({ usuario_id: usuarioId, rol }),
  }),
  removeMember: (workspaceId, usuarioId) => apiFetch(`/workspaces/${workspaceId}/members/${usuarioId}`, {
    method: "DELETE",
  }),
};
