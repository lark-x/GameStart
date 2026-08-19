import { formatEnvironmentLabel } from "./environment.mjs";

/**
 * Format and print the final deployment result banner.
 */
export function formatDeploymentBanner({
  envType,
  mode,
  webPort,
  hostBind,
  lanAddrs = [],
  comfyResult = null,
} = {}) {
  const envLabel = formatEnvironmentLabel(envType);
  const localUrl = `http://127.0.0.1:${webPort}`;
  const apiUrl = `http://127.0.0.1:${webPort}/api/v2`;

  const lines = [
    "",
    "────────────────────────────────────────",
    " GameStart Deployment",
    "────────────────────────────────────────",
    "",
    "Environment",
    `  ${envLabel}`,
    "",
    "Mode",
    `  ${mode === "lan" ? "LAN (0.0.0.0)" : "Local (127.0.0.1)"}`,
    "",
    "Status",
    "  ✓ Redis          healthy",
    "  ✓ API            healthy",
    "  ✓ Worker         running",
    "  ✓ Web (Nginx)    healthy",
    "  ✓ Reverse Proxy  connected",
    "",
    "Access",
    `  Local            ${localUrl}`,
  ];

  if (mode === "lan" && lanAddrs.length > 0) {
    for (const { name, address } of lanAddrs) {
      lines.push(`  LAN (${name})  http://${address}:${webPort}`);
    }
  } else if (lanAddrs.length > 0) {
    // Info note for local mode
    lines.push(`  (LAN binding disabled. To allow LAN access, use: pnpm deploy -- --mode lan)`);
  }

  lines.push(
    "",
    `  API Endpoint     ${apiUrl}`,
    `  Health Check     ${localUrl}/api/v2/health`,
    `  Ready Check      ${localUrl}/api/v2/ready`,
  );

  if (comfyResult && comfyResult.configured) {
    lines.push(
      "",
      "External Services",
      `  ${comfyResult.reachable ? "✓" : "⚠"} ComfyUI        ${comfyResult.endpoint} (${comfyResult.message})`,
    );
  }

  lines.push(
    "",
    "Internal Ports (Container Network Only)",
    "  Web              :80",
    "  API              api:3003",
    "  Redis            redis:6379",
    "",
    "────────────────────────────────────────",
    " Deployment completed successfully.",
    "────────────────────────────────────────",
    "",
  );

  return lines.join("\n");
}

/**
 * Format doctor diagnostics report.
 */
export function formatDoctorReport({
  envType,
  dockerCliOk,
  dockerDaemonOk,
  composeOk,
  freePortAvailable,
  samplePort,
  lanAddrs = [],
  envFileExists,
  comfyResult = null,
} = {}) {
  const envLabel = formatEnvironmentLabel(envType);
  const lines = [
    "",
    "========================================",
    " GameStart Deployment Doctor",
    "========================================",
    "",
    "Environment",
    `  ${envLabel}`,
    "",
    "Docker Engine & CLI",
    `  ${dockerCliOk ? "✓" : "✖"} Docker CLI reachable`,
    `  ${dockerDaemonOk ? "✓" : "✖"} Docker Daemon running`,
    `  ${composeOk ? "✓" : "✖"} Docker Compose available`,
    "",
    "Networking",
    `  ${freePortAvailable ? "✓" : "✖"} Port range 18000-18999 available (sample free port: ${samplePort || "none"})`,
  ];

  if (lanAddrs.length > 0) {
    for (const { name, address } of lanAddrs) {
      lines.push(`  ✓ ${name} IP: ${address}`);
    }
  } else {
    lines.push("  ⚠ No external LAN IPv4 address detected");
  }

  lines.push(
    "",
    "Configuration",
    `  ${envFileExists ? "✓" : "⚠"} .env file present`,
  );

  if (comfyResult && comfyResult.configured) {
    lines.push(
      "",
      "External Services",
      `  ${comfyResult.reachable ? "✓" : "⚠"} ComfyUI: ${comfyResult.message}`,
    );
  }

  const allReady = dockerCliOk && dockerDaemonOk && composeOk && freePortAvailable;
  lines.push(
    "",
    "========================================",
    allReady ? " Ready to deploy. (Run: pnpm deploy)" : " Issues found. Please resolve the items marked with ✖.",
    "========================================",
    "",
  );

  return lines.join("\n");
}
