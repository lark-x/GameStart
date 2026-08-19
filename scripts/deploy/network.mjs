import { networkInterfaces } from "node:os";
import { execFileSync } from "node:child_process";
import { detectEnvironment } from "./environment.mjs";

/**
 * Resolve the host bind IP based on deployment mode.
 */
export function resolveHostBind(mode) {
  return mode === "lan" ? "0.0.0.0" : "127.0.0.1";
}

/**
 * Get standard non-loopback LAN IPv4 addresses from local interfaces.
 */
export function getStandardLanAddresses(interfaces = networkInterfaces()) {
  const results = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (a.address.startsWith("127.") || a.address.startsWith("169.254.")) continue;
      // Exclude Docker default bridge subnet 172.17.x.x - 172.31.x.x
      if (a.address.startsWith("172.")) {
        const secondOctet = parseInt(a.address.split(".")[1] || "0", 10);
        if (secondOctet >= 17 && secondOctet <= 31) continue;
      }
      results.push({ name, address: a.address });
    }
  }
  return results;
}

/**
 * Query Windows Host LAN IPv4 addresses when running inside WSL2.
 */
export function getWslWindowsLanAddresses(execCommand = null) {
  try {
    const cmd = "powershell.exe";
    const psScript = "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback|Docker|WSL' -and $_.IPAddress -notmatch '^127\\.|^169\\.254\\.' }).IPAddress";
    const raw = execCommand
      ? execCommand(cmd, ["-NoProfile", "-Command", psScript])
      : execFileSync(cmd, ["-NoProfile", "-Command", psScript], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    
    if (!raw) return [];
    const ips = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(s));

    return ips.map((ip) => ({ name: "Windows Host", address: ip }));
  } catch {
    return [];
  }
}

/**
 * Get the most appropriate LAN addresses for the current environment.
 */
export function getLanAddresses({ envType = detectEnvironment(), execCommand = null, interfaces = networkInterfaces() } = {}) {
  if (envType === "wsl-docker-desktop") {
    const windowsIps = getWslWindowsLanAddresses(execCommand);
    if (windowsIps.length > 0) {
      return windowsIps;
    }
  }
  return getStandardLanAddresses(interfaces);
}
