import { promises as dns } from "node:dns";
import net from "node:net";
import type { EmailVerificationResult } from "./enrichment-engine.js";

export type EmailVerifierDependencies = {
  hasMxRecord?: (domain: string) => Promise<boolean>;
  smtpProbe?: (email: string) => Promise<EmailVerificationResult["status"]>;
  resolveMx?: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
  connect?: typeof net.connect;
  timeoutMs?: number;
  heloHost?: string;
  probeFrom?: string;
};

export type DetailedEmailVerificationResult = EmailVerificationResult & {
  checks: string[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyEmailAddress(
  email: string,
  dependencies: EmailVerifierDependencies = {},
): Promise<DetailedEmailVerificationResult> {
  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized)) {
    return { status: "invalid", confidenceMultiplier: 0, checks: ["format"] };
  }
  const domain = normalized.split("@")[1];
  const checks = ["format"];
  const hasMx = dependencies.hasMxRecord
    ? await dependencies.hasMxRecord(domain)
    : await defaultHasMxRecord(domain, dependencies);
  checks.push("mx");
  if (!hasMx) {
    return { status: "invalid", confidenceMultiplier: 0, checks };
  }

  const smtpStatus = dependencies.smtpProbe
    ? await dependencies.smtpProbe(normalized)
    : await defaultSmtpProbe(normalized, dependencies);
  checks.push("smtp");
  return {
    status: smtpStatus,
    confidenceMultiplier: smtpStatus === "valid" ? 1 : smtpStatus === "catch_all" ? 0.75 : 0.55,
    checks,
  };
}

async function defaultHasMxRecord(domain: string, dependencies: EmailVerifierDependencies): Promise<boolean> {
  try {
    const mx = await resolveMxRecords(domain, dependencies);
    return mx.length > 0;
  } catch {
    return false;
  }
}

async function defaultSmtpProbe(
  email: string,
  dependencies: EmailVerifierDependencies,
): Promise<EmailVerificationResult["status"]> {
  const domain = email.split("@")[1];
  let mx: Array<{ exchange: string; priority: number }>;
  try {
    mx = await resolveMxRecords(domain, dependencies);
  } catch {
    return "unknown";
  }
  const [server] = mx.sort((left, right) => left.priority - right.priority);
  if (!server) {
    return "invalid";
  }

  try {
    return await smtpRcptProbe(server.exchange, email, dependencies);
  } catch {
    return "unknown";
  }
}

async function resolveMxRecords(domain: string, dependencies: EmailVerifierDependencies) {
  const resolveMx = dependencies.resolveMx ?? ((value: string) => dns.resolveMx(value));
  return resolveMx(domain);
}

function smtpRcptProbe(
  host: string,
  email: string,
  dependencies: EmailVerifierDependencies,
): Promise<EmailVerificationResult["status"]> {
  const timeoutMs = dependencies.timeoutMs ?? 4_000;
  const connect = dependencies.connect ?? net.connect;
  const heloHost = dependencies.heloHost ?? "job-hunt.local";
  const probeFrom = dependencies.probeFrom ?? "probe@job-hunt.local";
  const commands = [
    `EHLO ${heloHost}\r\n`,
    `MAIL FROM:<${probeFrom}>\r\n`,
    `RCPT TO:<${email}>\r\n`,
    "QUIT\r\n",
  ];

  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 25 });
    let commandIndex = 0;
    let rcptStatus: EmailVerificationResult["status"] = "unknown";
    let settled = false;

    const finish = (status: EmailVerificationResult["status"]) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(status);
    };
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs, () => fail(new Error("smtp probe timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk) => {
      const line = chunk.toString("utf8");
      const code = Number(line.match(/^(\d{3})/)?.[1]);
      if (!Number.isFinite(code)) {
        return;
      }
      if (commandIndex >= 3) {
        finish(rcptStatus);
        return;
      }
      if (commandIndex === 2) {
        if (code >= 200 && code < 300) {
          rcptStatus = "valid";
        } else if (code === 450 || code === 451 || code === 452) {
          rcptStatus = "catch_all";
        } else if (code >= 500) {
          rcptStatus = "invalid";
        }
      }
      socket.write(commands[commandIndex]);
      commandIndex += 1;
    });
    socket.on("close", () => {
      if (!settled) {
        finish(rcptStatus);
      }
    });
  });
}
