import { describe, expect, it } from "vitest";

import {
  createAuthorTheoryCatalog,
  validateAuthorTheoryCatalog,
} from "./catalog";

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    authors: [
      {
        id: " author-1 ",
        canonicalName: " Autora Ficticia ",
        aliases: [" A. Ficticia "],
        schoolIds: ["school-1"],
        conceptIds: ["concept-1"],
      },
    ],
    schools: [{ id: " school-1 ", name: " Escuela Ficticia " }],
    concepts: [{ id: " concept-1 ", label: " Centro " }],
    ...overrides,
  };
}

describe("author theory catalog", () => {
  it("normaliza un catalogo y conserva solo identidad y relaciones", () => {
    const input = catalog({
      authors: [
        {
          id: " author-1 ",
          canonicalName: " Autora Ficticia ",
          aliases: [" A. Ficticia "],
          schoolIds: ["school-1"],
          conceptIds: ["concept-1"],
          statement: "No debe entrar al catalogo.",
        },
      ],
    });
    const result = createAuthorTheoryCatalog(input);

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        catalogVersion: "author-theory-catalog-v1",
        authors: [
          {
            id: "author-1",
            canonicalName: "Autora Ficticia",
            aliases: ["A. Ficticia"],
            schoolIds: ["school-1"],
            conceptIds: ["concept-1"],
          },
        ],
        schools: [{ id: "school-1", name: "Escuela Ficticia" }],
        concepts: [{ id: "concept-1", label: "Centro" }],
      },
    });
    expect(input).toEqual(
      catalog({
        authors: [
          {
            id: " author-1 ",
            canonicalName: " Autora Ficticia ",
            aliases: [" A. Ficticia "],
            schoolIds: ["school-1"],
            conceptIds: ["concept-1"],
            statement: "No debe entrar al catalogo.",
          },
        ],
      }),
    );
  });

  it("rechaza IDs, nombres y alias duplicados sin distinguir mayusculas", () => {
    expect(
      createAuthorTheoryCatalog(
        catalog({
          schools: [
            { id: "school-1", name: "Escuela Ficticia" },
            { id: "school-1", name: "Otra Escuela" },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_DUPLICATE_ID" },
    });
    expect(
      createAuthorTheoryCatalog(
        catalog({
          concepts: [
            { id: "concept-1", label: "Centro" },
            { id: "concept-2", label: " centro " },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_DUPLICATE_NAME" },
    });
    expect(
      createAuthorTheoryCatalog(
        catalog({
          authors: [
            {
              id: "author-1",
              canonicalName: "Autora Ficticia",
              aliases: [" autora ficticia "],
              schoolIds: ["school-1"],
              conceptIds: ["concept-1"],
            },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_DUPLICATE_ALIAS" },
    });
  });

  it("rechaza relaciones a escuelas o conceptos inexistentes", () => {
    expect(
      createAuthorTheoryCatalog(
        catalog({
          authors: [
            {
              id: "author-1",
              canonicalName: "Autora Ficticia",
              aliases: [],
              schoolIds: ["missing-school"],
              conceptIds: ["concept-1"],
            },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_INVALID_REFERENCE" },
    });
    expect(
      createAuthorTheoryCatalog(
        catalog({
          authors: [
            {
              id: "author-1",
              canonicalName: "Autora Ficticia",
              aliases: [],
              schoolIds: ["school-1"],
              conceptIds: ["missing-concept"],
            },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_INVALID_REFERENCE" },
    });
  });

  it("rechaza entidades vacias y colecciones con forma invalida", () => {
    expect(
      createAuthorTheoryCatalog(
        catalog({
          authors: [
            {
              id: " ",
              canonicalName: "Autora Ficticia",
              aliases: [],
              schoolIds: [],
              conceptIds: [],
            },
          ],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_INVALID" },
    });
    expect(
      createAuthorTheoryCatalog(catalog({ schools: "not-an-array" })),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_CATALOG_INVALID" },
    });
  });

  it("valida de nuevo una copia serializada", () => {
    const created = createAuthorTheoryCatalog(catalog());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const serialized = JSON.parse(JSON.stringify(created.value)) as unknown;
    expect(validateAuthorTheoryCatalog(serialized)).toEqual(created);
  });
});
