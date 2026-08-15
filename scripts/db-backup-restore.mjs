import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DATABASE_USER = "chess_mentor";
const SOURCE_DATABASE = "chess_mentor";
const RESTORE_DATABASE = "chess_mentor_restore_test";
const DOCKER_DEFAULT =
  "C:\\Users\\usuario\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe";

const dockerExe = process.env.CHESS_MENTOR_DOCKER_EXE ?? DOCKER_DEFAULT;
const keepBackup = process.argv.includes("--keep");
const repoRoot = path.resolve(process.cwd());

function run(executable, args) {
  try {
    return execFileSync(executable, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    const stderr = cause?.stderr?.toString().trim();
    const suffix = stderr === "" || stderr === undefined ? "" : `: ${stderr}`;
    throw new Error(`Comando falló: ${executable} ${args.join(" ")}${suffix}`, {
      cause,
    });
  }
}

function docker(args) {
  return run(dockerExe, args);
}

function compose(args) {
  return docker(["compose", ...args]);
}

function assertOutsideRepository(filePath) {
  const resolved = path.resolve(filePath).toLowerCase();
  const root = `${repoRoot.toLowerCase()}${path.sep}`;
  if (resolved.startsWith(root)) {
    throw new Error("El backup no puede quedar dentro del repositorio.");
  }
}

function dropRestoreDatabase(container) {
  docker([
    "exec",
    container,
    "psql",
    "-U",
    DATABASE_USER,
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${RESTORE_DATABASE}`,
  ]);
}

function main() {
  if (!existsSync(dockerExe)) {
    throw new Error(`No existe el ejecutable Docker: ${dockerExe}`);
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "chess-mentor-backup-"));
  const backupPath = path.join(tempRoot, "chess_mentor.dump");
  const containerDumpPath = `/tmp/chess-mentor-${process.pid}.dump`;
  assertOutsideRepository(backupPath);

  let container = "";
  let primaryError;
  let cleanupError;

  try {
    container = compose(["ps", "-q", "postgres"]).trim();
    if (container === "") {
      throw new Error("El contenedor postgres de Chess Mentor no está activo.");
    }

    docker([
      "exec",
      container,
      "pg_isready",
      "-U",
      DATABASE_USER,
      "-d",
      SOURCE_DATABASE,
    ]);
    docker([
      "exec",
      container,
      "pg_dump",
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "-U",
      DATABASE_USER,
      "-d",
      SOURCE_DATABASE,
      "-f",
      containerDumpPath,
    ]);
    docker(["cp", `${container}:${containerDumpPath}`, backupPath]);
    docker(["exec", container, "rm", "-f", containerDumpPath]);

    dropRestoreDatabase(container);
    docker([
      "exec",
      container,
      "psql",
      "-U",
      DATABASE_USER,
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `CREATE DATABASE ${RESTORE_DATABASE}`,
    ]);
    const restoreDumpPath = `/tmp/chess-mentor-restore-${process.pid}.dump`;
    docker(["cp", backupPath, `${container}:${restoreDumpPath}`]);
    docker([
      "exec",
      container,
      "pg_restore",
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "-U",
      DATABASE_USER,
      "-d",
      RESTORE_DATABASE,
      restoreDumpPath,
    ]);
    docker(["exec", container, "rm", "-f", restoreDumpPath]);

    const relationExists = docker([
      "exec",
      container,
      "psql",
      "-Atq",
      "-U",
      DATABASE_USER,
      "-d",
      RESTORE_DATABASE,
      "-c",
      `SELECT (to_regclass('public."JobRecord"') IS NOT NULL)`,
    ]).trim();
    if (relationExists !== "t") {
      throw new Error(
        `La restauración no contiene JobRecord: ${relationExists}`,
      );
    }
  } catch (error) {
    primaryError = error;
  } finally {
    if (container !== "") {
      try {
        docker(["exec", container, "rm", "-f", containerDumpPath]);
      } catch {
        // El contenedor puede haber terminado después del backup.
      }
      try {
        dropRestoreDatabase(container);
      } catch (error) {
        cleanupError = error;
      }
    }
    if (keepBackup) {
      console.log(`BACKUP_FILE=${backupPath}`);
    } else {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
  console.log("BACKUP_RESTORE_PASS");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
