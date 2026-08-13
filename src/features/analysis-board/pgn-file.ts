import { unzipSync } from "fflate";

import { MAX_PGN_INPUT_BYTES } from "@/domain/pgn/adapter";

const MAX_ARCHIVE_BYTES = 16 * 1_048_576;

export type PgnFileResult =
  Readonly<{ ok: true; text: string }> | Readonly<{ ok: false; error: string }>;

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

export async function readPgnFile(file: File): Promise<PgnFileResult> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isZip(bytes)) return { ok: true, text: await file.text() };
    if (bytes.byteLength > MAX_ARCHIVE_BYTES)
      return {
        ok: false,
        error: "El archivo ZIP supera el límite de 16 MiB.",
      };

    const entries = unzipSync(bytes);
    const pgnEntries = Object.entries(entries).filter(
      ([name, value]) =>
        name.toLowerCase().endsWith(".pgn") && value.length > 0,
    );
    if (pgnEntries.length === 0)
      return {
        ok: false,
        error: "El ZIP no contiene ningún archivo .pgn.",
      };
    if (pgnEntries.length > 1)
      return {
        ok: false,
        error:
          "El ZIP contiene varios archivos .pgn; descomprímelo y elige uno.",
      };
    const [, pgnBytes] = pgnEntries[0];
    if (pgnBytes.byteLength > MAX_PGN_INPUT_BYTES)
      return {
        ok: false,
        error: "El PGN descomprimido supera el límite de 32 MiB.",
      };
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(pgnBytes),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `No se pudo leer el archivo: ${error.message}`
          : "No se pudo leer el archivo.",
    };
  }
}
