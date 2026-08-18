export const AUTHOR_THEORY_CATALOG_SCHEMA_VERSION = 1 as const;
export const AUTHOR_THEORY_CATALOG_VERSION =
  "author-theory-catalog-v1" as const;

export type AuthorProfileV1 = Readonly<{
  id: string;
  canonicalName: string;
  aliases: readonly string[];
  schoolIds: readonly string[];
  conceptIds: readonly string[];
}>;

export type TheorySchoolV1 = Readonly<{
  id: string;
  name: string;
}>;

export type TheoryConceptV1 = Readonly<{
  id: string;
  label: string;
}>;

export type AuthorTheoryCatalogV1 = Readonly<{
  schemaVersion: typeof AUTHOR_THEORY_CATALOG_SCHEMA_VERSION;
  catalogVersion: typeof AUTHOR_THEORY_CATALOG_VERSION;
  authors: readonly AuthorProfileV1[];
  schools: readonly TheorySchoolV1[];
  concepts: readonly TheoryConceptV1[];
}>;

export type CreateAuthorTheoryCatalogInput = Readonly<{
  authors: readonly Readonly<{
    id: string;
    canonicalName: string;
    aliases: readonly string[];
    schoolIds: readonly string[];
    conceptIds: readonly string[];
  }>[];
  schools: readonly Readonly<{
    id: string;
    name: string;
  }>[];
  concepts: readonly Readonly<{
    id: string;
    label: string;
  }>[];
}>;

export type AuthorTheoryCatalogErrorCode =
  | "AUTHOR_THEORY_CATALOG_INVALID"
  | "AUTHOR_THEORY_CATALOG_DUPLICATE_ID"
  | "AUTHOR_THEORY_CATALOG_DUPLICATE_NAME"
  | "AUTHOR_THEORY_CATALOG_DUPLICATE_ALIAS"
  | "AUTHOR_THEORY_CATALOG_INVALID_REFERENCE";

export type AuthorTheoryCatalogError = Readonly<{
  code: AuthorTheoryCatalogErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number>>;
}>;

export type AuthorTheoryCatalogResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AuthorTheoryCatalogError }>;

function failure<T>(
  code: AuthorTheoryCatalogErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number>>,
): AuthorTheoryCatalogResult<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredText(
  value: unknown,
  field: string,
): AuthorTheoryCatalogResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      `${field} debe ser un texto no vacio.`,
    );
  }
  return { ok: true, value: value.trim() };
}

function comparisonKey(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function normalizeIdList(
  value: unknown,
  field: string,
): AuthorTheoryCatalogResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      `${field} debe ser un array.`,
    );
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const [index, rawId] of value.entries()) {
    const id = normalizeRequiredText(rawId, `${field}[${index}]`);
    if (!id.ok) return id;
    if (seen.has(id.value)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_ID",
        `${field} no puede repetir IDs.`,
        { id: id.value },
      );
    }
    seen.add(id.value);
    ids.push(id.value);
  }
  return { ok: true, value: ids };
}

function normalizeAliases(
  value: unknown,
  canonicalName: string,
): AuthorTheoryCatalogResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "aliases debe ser un array.",
    );
  }

  const aliases: string[] = [];
  const seen = new Set<string>([comparisonKey(canonicalName)]);
  for (const [index, rawAlias] of value.entries()) {
    const alias = normalizeRequiredText(rawAlias, `aliases[${index}]`);
    if (!alias.ok) return alias;
    const key = comparisonKey(alias.value);
    if (seen.has(key)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_ALIAS",
        "aliases no puede repetir el nombre canonico ni otro alias.",
        { alias: alias.value },
      );
    }
    seen.add(key);
    aliases.push(alias.value);
  }
  return { ok: true, value: aliases };
}

function normalizeAuthors(
  value: unknown,
): AuthorTheoryCatalogResult<readonly AuthorProfileV1[]> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "authors debe ser un array.",
    );
  }

  const authors: AuthorProfileV1[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, rawAuthor] of value.entries()) {
    if (!isRecord(rawAuthor)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_INVALID",
        `authors[${index}] debe ser un objeto.`,
      );
    }
    const id = normalizeRequiredText(rawAuthor.id, `authors[${index}].id`);
    if (!id.ok) return id;
    if (ids.has(id.value)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_ID",
        "authors no puede repetir IDs.",
        { id: id.value },
      );
    }
    ids.add(id.value);

    const canonicalName = normalizeRequiredText(
      rawAuthor.canonicalName,
      `authors[${index}].canonicalName`,
    );
    if (!canonicalName.ok) return canonicalName;
    const nameKey = comparisonKey(canonicalName.value);
    if (names.has(nameKey)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_NAME",
        "authors no puede repetir nombres canonicos.",
        { name: canonicalName.value },
      );
    }
    names.add(nameKey);

    const aliases = normalizeAliases(rawAuthor.aliases, canonicalName.value);
    if (!aliases.ok) return aliases;
    const schoolIds = normalizeIdList(
      rawAuthor.schoolIds,
      `authors[${index}].schoolIds`,
    );
    if (!schoolIds.ok) return schoolIds;
    const conceptIds = normalizeIdList(
      rawAuthor.conceptIds,
      `authors[${index}].conceptIds`,
    );
    if (!conceptIds.ok) return conceptIds;

    authors.push({
      id: id.value,
      canonicalName: canonicalName.value,
      aliases: [...aliases.value],
      schoolIds: [...schoolIds.value],
      conceptIds: [...conceptIds.value],
    });
  }
  return { ok: true, value: authors };
}

function normalizeSchools(
  value: unknown,
): AuthorTheoryCatalogResult<readonly TheorySchoolV1[]> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "schools debe ser un array.",
    );
  }

  const schools: TheorySchoolV1[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, rawSchool] of value.entries()) {
    if (!isRecord(rawSchool)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_INVALID",
        `schools[${index}] debe ser un objeto.`,
      );
    }
    const id = normalizeRequiredText(rawSchool.id, `schools[${index}].id`);
    if (!id.ok) return id;
    if (ids.has(id.value)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_ID",
        "schools no puede repetir IDs.",
        { id: id.value },
      );
    }
    ids.add(id.value);

    const name = normalizeRequiredText(
      rawSchool.name,
      `schools[${index}].name`,
    );
    if (!name.ok) return name;
    const nameKey = comparisonKey(name.value);
    if (names.has(nameKey)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_NAME",
        "schools no puede repetir nombres.",
        { name: name.value },
      );
    }
    names.add(nameKey);
    schools.push({ id: id.value, name: name.value });
  }
  return { ok: true, value: schools };
}

function normalizeConcepts(
  value: unknown,
): AuthorTheoryCatalogResult<readonly TheoryConceptV1[]> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "concepts debe ser un array.",
    );
  }

  const concepts: TheoryConceptV1[] = [];
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const [index, rawConcept] of value.entries()) {
    if (!isRecord(rawConcept)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_INVALID",
        `concepts[${index}] debe ser un objeto.`,
      );
    }
    const id = normalizeRequiredText(rawConcept.id, `concepts[${index}].id`);
    if (!id.ok) return id;
    if (ids.has(id.value)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_ID",
        "concepts no puede repetir IDs.",
        { id: id.value },
      );
    }
    ids.add(id.value);

    const label = normalizeRequiredText(
      rawConcept.label,
      `concepts[${index}].label`,
    );
    if (!label.ok) return label;
    const labelKey = comparisonKey(label.value);
    if (labels.has(labelKey)) {
      return failure(
        "AUTHOR_THEORY_CATALOG_DUPLICATE_NAME",
        "concepts no puede repetir labels.",
        { label: label.value },
      );
    }
    labels.add(labelKey);
    concepts.push({ id: id.value, label: label.value });
  }
  return { ok: true, value: concepts };
}

function validateReferences(
  authors: readonly AuthorProfileV1[],
  schools: readonly TheorySchoolV1[],
  concepts: readonly TheoryConceptV1[],
): AuthorTheoryCatalogResult<null> {
  const schoolIds = new Set(schools.map((school) => school.id));
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  for (const author of authors) {
    for (const schoolId of author.schoolIds) {
      if (!schoolIds.has(schoolId)) {
        return failure(
          "AUTHOR_THEORY_CATALOG_INVALID_REFERENCE",
          "author schoolId no existe en el catalogo.",
          { authorId: author.id, schoolId },
        );
      }
    }
    for (const conceptId of author.conceptIds) {
      if (!conceptIds.has(conceptId)) {
        return failure(
          "AUTHOR_THEORY_CATALOG_INVALID_REFERENCE",
          "author conceptId no existe en el catalogo.",
          { authorId: author.id, conceptId },
        );
      }
    }
  }
  return { ok: true, value: null };
}

function normalizeCatalog(
  value: unknown,
): AuthorTheoryCatalogResult<AuthorTheoryCatalogV1> {
  if (!isRecord(value)) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "El catalogo debe ser un objeto.",
    );
  }
  if (value.schemaVersion !== AUTHOR_THEORY_CATALOG_SCHEMA_VERSION) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "schemaVersion de catalogo no soportada.",
    );
  }
  if (value.catalogVersion !== AUTHOR_THEORY_CATALOG_VERSION) {
    return failure(
      "AUTHOR_THEORY_CATALOG_INVALID",
      "catalogVersion no soportada.",
    );
  }

  const authors = normalizeAuthors(value.authors);
  if (!authors.ok) return authors;
  const schools = normalizeSchools(value.schools);
  if (!schools.ok) return schools;
  const concepts = normalizeConcepts(value.concepts);
  if (!concepts.ok) return concepts;
  const references = validateReferences(
    authors.value,
    schools.value,
    concepts.value,
  );
  if (!references.ok) return references;

  return {
    ok: true,
    value: {
      schemaVersion: AUTHOR_THEORY_CATALOG_SCHEMA_VERSION,
      catalogVersion: AUTHOR_THEORY_CATALOG_VERSION,
      authors: authors.value.map((author) => ({
        ...author,
        aliases: [...author.aliases],
        schoolIds: [...author.schoolIds],
        conceptIds: [...author.conceptIds],
      })),
      schools: schools.value.map((school) => ({ ...school })),
      concepts: concepts.value.map((concept) => ({ ...concept })),
    },
  };
}

export function validateAuthorTheoryCatalog(
  value: unknown,
): AuthorTheoryCatalogResult<AuthorTheoryCatalogV1> {
  return normalizeCatalog(value);
}

export function createAuthorTheoryCatalog(
  input: CreateAuthorTheoryCatalogInput,
): AuthorTheoryCatalogResult<AuthorTheoryCatalogV1> {
  return normalizeCatalog({
    ...input,
    schemaVersion: AUTHOR_THEORY_CATALOG_SCHEMA_VERSION,
    catalogVersion: AUTHOR_THEORY_CATALOG_VERSION,
  });
}
