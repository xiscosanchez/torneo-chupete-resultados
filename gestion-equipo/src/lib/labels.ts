import type {
  CallupStatus,
  EventType,
  MatchStatus,
  MatchType,
  PositionGroup,
} from "./types";

export const POSITION_LABELS: Record<PositionGroup, string> = {
  POR: "Portero",
  DEF: "Defensa",
  CEN: "Centrocampista",
  DEL: "Delantero",
};

export const POSITION_COLORS: Record<PositionGroup, string> = {
  POR: "bg-amber-100 text-amber-800",
  DEF: "bg-sky-100 text-sky-800",
  CEN: "bg-emerald-100 text-emerald-800",
  DEL: "bg-rose-100 text-rose-800",
};

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  liga: "Liga",
  amistoso: "Amistoso",
  copa: "Copa",
  torneo: "Torneo",
};

export const MATCH_TYPE_COLORS: Record<MatchType, string> = {
  liga: "bg-emerald-100 text-emerald-800",
  amistoso: "bg-slate-100 text-slate-700",
  copa: "bg-violet-100 text-violet-800",
  torneo: "bg-amber-100 text-amber-800",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  programado: "Programado",
  en_juego: "En juego",
  finalizado: "Finalizado",
  suspendido: "Suspendido",
};

export const CALLUP_STATUS_LABELS: Record<CallupStatus, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export const EVENT_LABELS: Record<EventType, string> = {
  gol: "Gol",
  tiro: "Tiro",
  tiro_puerta: "Tiro a puerta",
  corner: "Córner",
  falta: "Falta",
  amarilla: "T. amarilla",
  roja: "T. roja",
  fuera_juego: "Fuera de juego",
  penalti: "Penalti",
  cambio: "Cambio",
};

export const EVENT_ICONS: Record<EventType, string> = {
  gol: "⚽",
  tiro: "🎯",
  tiro_puerta: "🥅",
  corner: "🚩",
  falta: "⚠️",
  amarilla: "🟨",
  roja: "🟥",
  fuera_juego: "🏳️",
  penalti: "⭕",
  cambio: "🔁",
};

export const FORMATIONS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2"] as const;
