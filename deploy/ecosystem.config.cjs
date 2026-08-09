/** PM2 — API Salètse en VPS (nginx sirve el SPA estático). */
module.exports = {
  apps: [
    {
      name: "saletse-api",
      cwd: "/var/www/Saletse",
      script: "npm",
      args: "run start -w @salesapp/api",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        API_PORT: "4000",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
      },
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
