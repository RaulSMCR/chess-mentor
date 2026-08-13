import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const TOKEN_ENV = "CHESS_MENTOR_WORKER_TOKEN";
const TOKEN_FILE = [".runtime", "worker-token"] as const;
const TOKEN_BYTES = 32;

export function createRandomWorkerToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function tokensEqual(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  if (expectedBytes.length !== receivedBytes.length) return false;
  return timingSafeEqual(expectedBytes, receivedBytes);
}

export async function resolveWorkerToken(
  cwd = process.cwd(),
): Promise<
  Readonly<{ token: string; source: "environment" | "file" | "generated" }>
> {
  const environmentToken = process.env[TOKEN_ENV]?.trim();
  if (environmentToken !== undefined && environmentToken !== "") {
    return { token: environmentToken, source: "environment" };
  }

  const tokenPath = resolve(cwd, ...TOKEN_FILE);
  try {
    const fileToken = (await readFile(tokenPath, "utf8")).trim();
    if (fileToken !== "") return { token: fileToken, source: "file" };
  } catch (error) {
    const code = error as NodeJS.ErrnoException;
    if (code.code !== "ENOENT") throw error;
  }

  const token = createRandomWorkerToken();
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token}\n`, {
    encoding: "utf8",
    flag: "wx",
  }).catch(async (error: unknown) => {
    const code = error as NodeJS.ErrnoException;
    if (code.code !== "EEXIST") throw error;
    const existing = (await readFile(tokenPath, "utf8")).trim();
    if (existing === "") throw new Error("Worker token file is empty.");
    return undefined;
  });
  const persisted = (await readFile(tokenPath, "utf8")).trim();
  if (persisted === "") throw new Error("Worker token file is empty.");
  return { token: persisted, source: "generated" };
}
