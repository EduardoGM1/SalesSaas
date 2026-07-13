async function apiFetch(path, options = {}) {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
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
  conversations: () => apiFetch("/messages/conversations"),
  thread: (userId) => apiFetch(`/messages?with=${encodeURIComponent(userId)}`),
  send: (recipientId, body) => apiFetch("/messages", {
    method: "POST",
    body: JSON.stringify({ recipient_id: recipientId, body }),
  }),
  markRead: (userId) => apiFetch(`/messages/read?with=${encodeURIComponent(userId)}`, { method: "PATCH" }),
  unreadCount: () => apiFetch("/messages/unread-count"),
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
  create: (prospectId, sharedWithId, permission) => apiFetch(`/prospects/${prospectId}/shares`, {
    method: "POST",
    body: JSON.stringify({ shared_with_id: sharedWithId, permission }),
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
  updatePermission: (shareId, permission) => apiFetch(`/shares/${shareId}`, {
    method: "PATCH",
    body: JSON.stringify({ permission }),
  }),
  remove: (shareId) => apiFetch(`/shares/${shareId}`, { method: "DELETE" }),
  updateProspect: (prospectId, body) => apiFetch(`/shared-prospects/${prospectId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  }),
};
