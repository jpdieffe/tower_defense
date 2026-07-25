import Peer, { type DataConnection } from 'peerjs';
import {
  peerIdForRoom, type NetMessage, type Transport,
} from './protocol';

const PEER_OPTIONS = {
  // Public STUN servers are enough for the vast majority of home/mobile networks.
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
  debug: 0,
} as const;

/**
 * A WebRTC data channel between exactly two phones.
 *
 * PeerJS's free broker is only used to trade connection details; once the
 * handshake is done, every packet goes straight from phone to phone.
 */
class PeerTransport implements Transport {
  onMessage: ((msg: NetMessage) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  onError: ((err: string) => void) | null = null;

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private closed = false;

  get open(): boolean {
    return !!this.conn && this.conn.open && !this.closed;
  }

  attach(peer: Peer, conn: DataConnection): void {
    this.peer = peer;
    this.conn = conn;

    conn.on('data', (raw) => {
      if (this.closed) return;
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : (raw as NetMessage);
        this.onMessage?.(msg as NetMessage);
      } catch {
        this.onError?.('Received a malformed packet.');
      }
    });
    conn.on('open', () => this.onOpen?.());
    conn.on('close', () => {
      if (this.closed) return;
      this.closed = true;
      this.onClose?.('Your partner disconnected.');
    });
    conn.on('error', (err) => this.onError?.(String(err?.message ?? err)));

    if (conn.open) queueMicrotask(() => this.onOpen?.());
  }

  send(msg: NetMessage): void {
    if (!this.conn || !this.conn.open || this.closed) return;
    try {
      this.conn.send(JSON.stringify(msg));
    } catch (err) {
      this.onError?.(String(err));
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.conn?.close(); } catch { /* already gone */ }
    try { this.peer?.destroy(); } catch { /* already gone */ }
  }
}

export interface HostHandle {
  transport: PeerTransport;
  cancel(): void;
}

/** Open a room and wait for one guest. */
export function hostRoom(
  code: string,
  onConnected: (t: Transport) => void,
  onError: (msg: string) => void,
): HostHandle {
  const transport = new PeerTransport();
  const peer = new Peer(peerIdForRoom(code), PEER_OPTIONS);
  let settled = false;

  peer.on('error', (err) => {
    const type = (err as unknown as { type?: string }).type;
    if (type === 'unavailable-id') {
      onError('That room code is already taken - try creating another room.');
    } else if (!settled) {
      onError(friendlyPeerError(type, err.message));
    }
  });

  peer.on('connection', (conn) => {
    if (settled) {
      conn.close();
      return;
    }
    settled = true;
    transport.attach(peer, conn);
    onConnected(transport);
  });

  return {
    transport,
    cancel(): void {
      settled = true;
      try { peer.destroy(); } catch { /* ignore */ }
    },
  };
}

/** Join an existing room by code. */
export function joinRoom(
  code: string,
  onConnected: (t: Transport) => void,
  onError: (msg: string) => void,
): HostHandle {
  const transport = new PeerTransport();
  const peer = new Peer(PEER_OPTIONS);
  let settled = false;
  let timer = 0;

  peer.on('open', () => {
    const conn = peer.connect(peerIdForRoom(code), {
      reliable: true,
      serialization: 'json',
    });
    transport.attach(peer, conn);
    conn.on('open', () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      onConnected(transport);
    });
    timer = window.setTimeout(() => {
      if (settled) return;
      onError(`No room called "${code}" answered. Check the code and that your friend's room is still open.`);
    }, 15000);
  });

  peer.on('error', (err) => {
    const type = (err as unknown as { type?: string }).type;
    if (type === 'peer-unavailable') {
      onError(`No room called "${code}" is open right now.`);
    } else {
      onError(friendlyPeerError(type, err.message));
    }
  });

  return {
    transport,
    cancel(): void {
      settled = true;
      window.clearTimeout(timer);
      try { peer.destroy(); } catch { /* ignore */ }
    },
  };
}

function friendlyPeerError(type: string | undefined, message: string): string {
  switch (type) {
    case 'browser-incompatible':
      return 'This browser does not support WebRTC. Try Chrome, Safari or Firefox.';
    case 'network':
      return 'Lost contact with the matchmaking server. Check your connection.';
    case 'server-error':
      return 'The matchmaking server is unreachable right now.';
    case 'webrtc':
      return 'The direct connection failed. Both phones may be on very restrictive networks.';
    default:
      return message || 'Connection failed.';
  }
}
