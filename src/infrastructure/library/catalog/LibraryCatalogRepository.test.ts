import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIBRARY_CATALOG_STORAGE_KEY,
  LocalStorageLibraryCatalogRepository,
  MemoryLibraryCatalogRepository,
  type LibraryCatalogEntryV1,
  type LibraryKeyValueStorage,
} from "./LibraryCatalogRepository";

const entries = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/catalog/golden.entries.json"),
    "utf8",
  ),
) as readonly LibraryCatalogEntryV1[];
const expected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/catalog/golden.expected.json"),
    "utf8",
  ),
) as Readonly<{
  storageKey: string;
  schemaVersion: number;
  listImportKeys: readonly string[];
  reviewStatus: string;
  confidence: string;
  upsertKinds: readonly string[];
  chunkId: string;
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class FakeStorage implements LibraryKeyValueStorage {
  value: string | null = null;
  writes = 0;
  readError: Error | null = null;
  writeError: Error | null = null;

  getItem(key: string): string | null {
    if (key !== LIBRARY_CATALOG_STORAGE_KEY) return null;
    if (this.readError !== null) throw this.readError;
    return this.value;
  }

  setItem(key: string, value: string): void {
    if (key !== LIBRARY_CATALOG_STORAGE_KEY) return;
    if (this.writeError !== null) throw this.writeError;
    this.value = value;
    this.writes += 1;
  }
}

async function expectCode(
  action: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(action()).rejects.toThrowError(
    expect.objectContaining({ code }),
  );
}

describe("LibraryCatalogRepository", () => {
  it("persiste entradas derivadas, ordena y conserva revision", async () => {
    const storage = new FakeStorage();
    const repository = new LocalStorageLibraryCatalogRepository(() => storage);
    const first = await repository.upsert(entries[0]!);
    const second = await repository.upsert(entries[0]!);
    const listed = await repository.list();
    const fetched = await repository.get(entries[0]!.importKey);

    expect(expected.storageKey).toBe(LIBRARY_CATALOG_STORAGE_KEY);
    expect(first.kind).toBe(expected.upsertKinds[0]);
    expect(second.kind).toBe(expected.upsertKinds[1]);
    expect(storage.writes).toBe(1);
    expect(listed.map((entry) => entry.importKey)).toEqual([
      entries[0]!.importKey,
    ]);
    expect(fetched?.chunks[0]?.id).toBe(expected.chunkId);
    expect(fetched?.reviewStatus).toBe(expected.reviewStatus);
    expect(fetched?.confidence).toBe(expected.confidence);
    expect(JSON.parse(storage.value!).schemaVersion).toBe(
      expected.schemaVersion,
    );
    expect(storage.value).not.toContain("base64");
    expect(storage.value).not.toContain("Uint8Array");
  });

  it("ofrece memoria y aisla mutaciones de entrada y salida", async () => {
    const repository = new MemoryLibraryCatalogRepository([
      entries[1]!,
      entries[0]!,
    ]);
    const input = clone(entries[1]!);
    const before = await repository.get(input.importKey);
    const listed = await repository.list();

    expect(listed.map((entry) => entry.importKey)).toEqual(
      expected.listImportKeys,
    );
    expect(before).toEqual(entries[1]);
    (input.chunks[0] as { text: string }).text = "texto mutado";
    (listed[0]!.chunks[0]!.locator as { kind: string }).kind = "mutated";
    expect(await repository.get(entries[1]!.importKey)).toEqual(entries[1]);
  });

  it("rechaza conflicto y mantiene la carga anterior", async () => {
    const storage = new FakeStorage();
    const repository = new LocalStorageLibraryCatalogRepository(() => storage);
    await repository.upsert(entries[0]!);
    const conflict = clone(entries[0]!);
    (conflict.chunks[0] as { text: string }).text = "otro derivado";

    await expectCode(
      () => repository.upsert(conflict),
      "LIBRARY_IMPORT_CONFLICT",
    );
    expect(storage.writes).toBe(1);
    expect((await repository.get(entries[0]!.importKey))?.chunks[0]?.text).toBe(
      entries[0]!.chunks[0]!.text,
    );
  });

  it("rechaza estados de revision invalidos y envelopes corruptos", async () => {
    const invalid = { ...clone(entries[0]!), reviewStatus: "pending" as const };
    delete invalid.reviewReason;
    const memory = new MemoryLibraryCatalogRepository();
    await expectCode(() => memory.upsert(invalid), "INVALID_ENTRY");

    const storage = new FakeStorage();
    const repository = new LocalStorageLibraryCatalogRepository(() => storage);
    storage.value = "{invalid";
    await expectCode(() => repository.list(), "STORAGE_CORRUPT");
    expect(storage.value).toBe("{invalid");
    storage.value = JSON.stringify({
      schemaVersion: 1,
      entries: { wrong: entries[0] },
    });
    await expectCode(() => repository.list(), "STORAGE_CORRUPT");
  });

  it("distingue proveedor no disponible y cuota agotada", async () => {
    const unavailable = new LocalStorageLibraryCatalogRepository(() => {
      throw new Error("offline");
    });
    await expectCode(() => unavailable.list(), "STORAGE_UNAVAILABLE");

    const storage = new FakeStorage();
    storage.writeError = Object.assign(new Error("quota"), {
      name: "QuotaExceededError",
    });
    const repository = new LocalStorageLibraryCatalogRepository(() => storage);
    await expectCode(() => repository.upsert(entries[0]!), "STORAGE_QUOTA");
    expect(storage.value).toBeNull();
  });
});
