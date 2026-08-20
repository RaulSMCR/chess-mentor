"use client";

import { useEffect, useState } from "react";

import { AnalysisBoard } from "@/features/analysis-board/AnalysisBoard";
import type {
  InstructorCapabilitiesResponseV1,
  InstructorCapabilityV1,
} from "@/server/instructor/contracts";

import {
  WorkspaceMenu,
  type WorkspaceCapability,
  type WorkspaceMode,
} from "./WorkspaceMenu";

type CapabilitiesEnvelope = Readonly<{
  ok: true;
  data: InstructorCapabilitiesResponseV1;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInstructorCapability(
  value: unknown,
): value is InstructorCapabilityV1 {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.status === "available" || value.status === "degraded") &&
    (value.reason === null || typeof value.reason === "string")
  );
}

function readCapabilities(value: unknown): CapabilitiesEnvelope | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    return null;
  }

  const data = value.data;
  const capabilities = data.capabilities;
  const security = data.security;
  if (!isRecord(capabilities) || !isRecord(security)) {
    return null;
  }
  if (
    !isInstructorCapability(capabilities.instructor) ||
    security.sameOrigin !== true ||
    security.privateServicesExposed !== false
  ) {
    return null;
  }

  return { ok: true, data: data as InstructorCapabilitiesResponseV1 };
}

const unavailableCapability: InstructorCapabilityV1 = {
  status: "degraded",
  reason: "No se pudo confirmar la disponibilidad del instructor.",
};

function InstructorEntry() {
  return (
    <main className="analysis-shell workspace-placeholder">
      <header className="analysis-header">
        <p className="eyebrow">Modo de estudio</p>
        <h1>Instructor</h1>
        <p className="session-title">
          La capacidad local está disponible para la siguiente etapa del
          workspace.
        </p>
      </header>
      <section
        className="position-card"
        aria-labelledby="instructor-entry-title"
      >
        <h2 id="instructor-entry-title">Entrada de Instructor</h2>
        <p>
          Aquí se integrarán las fuentes, el diálogo, el análisis y la
          prospectiva sin mezclar sus procedencias.
        </p>
        <p className="workspace-capability" role="status">
          La interfaz completa se habilitará en el siguiente paso.
        </p>
      </section>
    </main>
  );
}

type WorkspaceNavigationProps = Readonly<{
  mode: WorkspaceMode;
  onBack: () => void;
}>;

function WorkspaceNavigation({ mode, onBack }: WorkspaceNavigationProps) {
  return (
    <nav className="workspace-mode-nav" aria-label="Navegación del modo">
      <button type="button" onClick={onBack}>
        Volver al menú
      </button>
      <span aria-current="page">
        {mode === "practice" ? "Práctica" : "Instructor"}
      </span>
    </nav>
  );
}

export function WorkspaceShell() {
  const [mode, setMode] = useState<WorkspaceMode | null>(null);
  const [capability, setCapability] = useState<WorkspaceCapability>({
    status: "checking",
    reason: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/instructor/capabilities", {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("capabilities request failed");
        }
        const payload = readCapabilities(await response.json());
        if (payload === null) {
          throw new Error("capabilities payload invalid");
        }
        if (!cancelled) {
          setCapability(payload.data.capabilities.instructor);
        }
      } catch {
        if (!cancelled) {
          setCapability(unavailableCapability);
        }
      }
    }

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === null) {
    return <WorkspaceMenu capability={capability} onSelect={setMode} />;
  }

  return (
    <>
      <WorkspaceNavigation mode={mode} onBack={() => setMode(null)} />
      {mode === "practice" ? <AnalysisBoard /> : <InstructorEntry />}
    </>
  );
}
