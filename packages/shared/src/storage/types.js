function emptyDatabase() {
  return {
    clients: {},
    sales: {},
    libre: {},
    cal: {},
    goals: {},
    userActivities: [],
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
  emptyDatabase
};
