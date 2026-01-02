// Helper to temporarily set environment variables for a test and restore them after
export function withEnv(env: Record<string, string>, fn: () => Promise<void> | void) {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    old[k] = Deno.env.get(k);
    Deno.env.set(k, env[k]);
  }
  try {
    const res = fn();
    if (res && typeof (res as any).then === "function") {
      return (res as any).finally(() => {
        for (const k of Object.keys(env)) {
          if (old[k] === undefined) Deno.env.delete(k);
          else Deno.env.set(k, old[k] as string);
        }
      });
    }
  } finally {
    for (const k of Object.keys(env)) {
      if (old[k] === undefined) Deno.env.delete(k);
      else Deno.env.set(k, old[k] as string);
    }
  }
}

export function isTruthyEnv(name: string): boolean {
  const value = Deno.env.get(name);
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
  return normalized !== "0" && normalized !== "false" && normalized !== "no" && normalized !== "off";
}

export function isCi(): boolean {
  return isTruthyEnv("CI");
}
