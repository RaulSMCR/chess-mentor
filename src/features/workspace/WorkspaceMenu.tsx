import type { InstructorCapabilityV1 } from "@/server/instructor/contracts";

export type WorkspaceMode = "practice" | "instructor";

export type WorkspaceCapability =
  InstructorCapabilityV1 | Readonly<{ status: "checking"; reason: null }>;

type WorkspaceMenuProps = Readonly<{
  capability: WorkspaceCapability;
  onSelect: (mode: WorkspaceMode) => void;
}>;

function capabilityMessage(capability: WorkspaceCapability): string {
  if (capability.status === "checking") {
    return "Consultando capacidades de esta instancia…";
  }
  if (capability.status === "available") {
    return "Disponible en esta instancia.";
  }
  return capability.reason ?? "No disponible en esta instancia.";
}

export function WorkspaceMenu({ capability, onSelect }: WorkspaceMenuProps) {
  const instructorAvailable = capability.status === "available";
  const instructorStatusId = "workspace-instructor-status";

  return (
    <main className="workspace-menu-shell">
      <section
        className="workspace-menu"
        aria-labelledby="workspace-menu-title"
      >
        <header className="workspace-menu-header">
          <p className="eyebrow">Entrada PWA</p>
          <h1 id="workspace-menu-title">Chess Mentor</h1>
          <p>
            Elige cómo quieres estudiar. Puedes volver a este menú desde
            cualquiera de los dos modos.
          </p>
        </header>

        <div className="workspace-mode-grid">
          <article className="workspace-mode-card">
            <p className="workspace-mode-kicker">Resolver</p>
            <h2>Práctica</h2>
            <p>
              Trabaja con el tablero y ejercicios aprobados, siguiendo la
              continuación prevista sin elegir la respuesta de la contraparte.
            </p>
            <p className="workspace-capability" role="status">
              Disponible en el navegador.
            </p>
            <button type="button" onClick={() => onSelect("practice")}>
              Entrar en Práctica
            </button>
          </article>

          <article className="workspace-mode-card">
            <p className="workspace-mode-kicker">Investigar</p>
            <h2>Instructor</h2>
            <p>
              Estudia una posición con fuentes, preguntas, análisis, prospectiva
              y respuestas posibles de la contraparte.
            </p>
            <p
              id={instructorStatusId}
              className="workspace-capability"
              role="status"
              aria-live="polite"
            >
              {capabilityMessage(capability)}
            </p>
            <button
              type="button"
              disabled={!instructorAvailable}
              aria-describedby={instructorStatusId}
              onClick={() => onSelect("instructor")}
            >
              {instructorAvailable
                ? "Entrar en Instructor"
                : "Instructor no disponible"}
            </button>
          </article>
        </div>

        <p className="workspace-menu-note">
          La aplicación consulta capacidades por el mismo origen. No expone URLs
          ni tokens de servicios privados del equipo.
        </p>
      </section>
    </main>
  );
}
