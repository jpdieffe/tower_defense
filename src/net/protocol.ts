import type { MatchConfig } from '../sim/state';
import type { GameState } from '../sim/types';

export const PROTOCOL_VERSION = 3;

export interface LobbyInfo {
  name: string;
  heroId: number;
  ready: boolean;
}

export type NetMessage =
  | { t: 'hello'; v: number; name: string }
  | { t: 'lobby'; players: LobbyInfo[]; mapId: number; difficulty: number; hostReady: boolean }
  | { t: 'pick'; heroId: number; name: string; ready: boolean }
  | { t: 'start'; match: MatchConfig; inputDelay: number }
  /** Commands for a future tick. Sent every tick, even when empty. */
  | { t: 'inp'; k: number; c: number[][] }
  | { t: 'hash'; k: number; h: number }
  | { t: 'ping'; s: number }
  | { t: 'pong'; s: number }
  | { t: 'snap'; k: number; s: GameState }
  | { t: 'bye'; why: string };

export interface Transport {
  readonly open: boolean;
  send(msg: NetMessage): void;
  close(): void;
  onMessage: ((msg: NetMessage) => void) | null;
  onOpen: (() => void) | null;
  onClose: ((reason: string) => void) | null;
  onError: ((err: string) => void) | null;
}

/** Human-friendly, unambiguous room codes (no O/0/I/1 confusion). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(len = 4): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
}

/** PeerJS ids are global, so namespace them to avoid clashing with other apps. */
export function peerIdForRoom(code: string): string {
  return `bulwark-td-v${PROTOCOL_VERSION}-${code}`;
}

export function randomSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return (b[0] >>> 0) || 1;
}
