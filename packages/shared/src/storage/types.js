function emptyPendingDeletes() {
  return {
    prospects: [],
    sales: [],
    calendar_entries: [],
    activities: [],
    tool_calculations: [],
  };
}

function emptyDatabase() {
  return {
    clients: {},
    sales: {},
    libre: {},
    cal: {},
    goals: {},
    userActivities: [],
    pendingDeletes: emptyPendingDeletes(),
    settings: {
      language: "es",
      currency: "USD",
      exchangeRate: 1,
      exchangeMode: "manual",
      userName: "Usuario",
      userInitials: "U"
    }
  };
}
export {
  emptyDatabase,
  emptyPendingDeletes,
};
