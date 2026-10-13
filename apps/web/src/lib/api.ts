const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = data as ApiError | null;
    throw Object.assign(
      new Error(err?.error?.message ?? `Request failed (${res.status})`),
      {
        status: res.status,
        code: err?.error?.code ?? "UNKNOWN",
        details: err?.error?.details ?? {},
      },
    );
  }
  return data as T;
}

export type MeResponse = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  plan: {
    planId: string;
    displayName: string;
    limits: {
      maxOwnedPersonas: number;
      maxChatMemoryMessages: number;
      maxChatMessagesPerDay: number | null;
    };
  } | null;
};

export type PlanResponse = {
  planId: string;
  displayName: string;
  ownedPersonaCount: number;
  maxOwnedPersonas: number;
  maxChatMemoryMessages: number;
  maxChatMessagesPerDay: number | null;
  chatMessagesUsedToday: number;
  canCreatePersona: boolean;
  overLimit: boolean;
};

export type PersonaListItem = {
  id: string;
  displayName: string;
  scenario: "living" | "legacy";
  status: string;
  role: string;
  chatEligible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonaDetail = PersonaListItem & {
  alternateNames: string[];
  languages: string[];
  biography: string | null;
  providerKey: string | null;
  audience: string;
  attestation: {
    kind: string;
    statement: string;
    evidenceNote: string | null;
    status: string;
  } | null;
  consents: Array<{
    id: string;
    purpose: string;
    providerKey: string | null;
    statementVersion: string;
    grantedAt: string;
  }>;
};
