import { spawn } from "child_process";
import path from "path";

async function main() {
  process.env.HHI_DEV_CONTEXT_ENABLED = "true";
  const port = process.env.HHI_DEV_CONTEXT_PORT ?? "3999";

  const tsxCli = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const devContextServer = path.resolve(
    process.cwd(),
    "hhi-dev-context",
    "scripts",
    "run-server.ts",
  );

  const devContext = spawn(
    process.execPath,
    [tsxCli, devContextServer],
    {
      stdio: "inherit",
      env: { ...process.env, HHI_DEV_CONTEXT_PORT: port },
      shell: false,
    },
  );

  // Give the API a moment to come up.
  await new Promise((r) => setTimeout(r, 1500));

  const nextCli = path.resolve(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const next = spawn(process.execPath, [nextCli, "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  const shutdown = () => {
    try {
      devContext.kill();
    } catch {
      // ignore
    }
    try {
      next.kill();
    } catch {
      // ignore
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const exitCode: number = await new Promise((resolve) => {
    next.on("exit", (code) => resolve(code ?? 1));
  });
  shutdown();
  process.exit(exitCode);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[dev-with-dev-context] crashed:", e);
  process.exit(1);
});

