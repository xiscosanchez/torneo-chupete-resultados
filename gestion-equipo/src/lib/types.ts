export type UserRole = "entrenador" | "jugador";
export type PositionGroup = "POR" | "DEF" | "CEN" | "DEL";
export type MatchType = "liga" | "amistoso" | "copa" | "torneo";
export type MatchStatus = "programado" | "en_juego" | "finalizado" | "suspendido";
export type CallupStatus = "pendiente" | "aceptada" | "rechazada";
export type EventTeam = "favor" | "contra";
export type EventType =
  | "gol"
  | "tiro"
  | "tiro_puerta"
  | "corner"
  | "falta"
  | "amarilla"
  | "roja"
  | "fuera_juego"
  | "penalti"
  | "cambio";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
}

export interface Player {
  id: string;
  profile_id: string | null;
  nombre: string;
  apellidos: string;
  dni: string | null;
  fecha_nacimiento: string | null;
  demarcacion: PositionGroup;
  subposicion: string | null;
  dorsal: number | null;
  foto_path: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
}

/** Vista players_public: sin DNI, teléfono, email ni notas */
export type PlayerPublic = Pick<
  Player,
  | "id"
  | "profile_id"
  | "nombre"
  | "apellidos"
  | "demarcacion"
  | "subposicion"
  | "dorsal"
  | "foto_path"
  | "activo"
>;

export interface Match {
  id: string;
  tipo: MatchType;
  rival: string;
  fecha: string;
  lugar: string | null;
  es_local: boolean;
  estado: MatchStatus;
  goles_favor: number;
  goles_contra: number;
  notas: string | null;
}

export interface Callup {
  id: string;
  match_id: string;
  deadline: string | null;
  notas: string | null;
  published_at: string | null;
}

export interface CallupPlayer {
  id: string;
  callup_id: string;
  player_id: string;
  estado: CallupStatus;
  motivo: string | null;
  responded_at: string | null;
}

export interface Lineup {
  id: string;
  match_id: string;
  formacion: string;
  published_at: string | null;
}

export interface LineupPlayer {
  id: string;
  lineup_id: string;
  player_id: string;
  titular: boolean;
  pos_x: number | null;
  pos_y: number | null;
}

export interface MatchEvent {
  id: string;
  match_id: string;
  minuto: number;
  equipo: EventTeam;
  tipo: EventType;
  player_id: string | null;
  created_at: string;
}
