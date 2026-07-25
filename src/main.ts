import './styles.css';

import { audio } from './audio/audio';
import { music } from './audio/music';
import { atlas } from './render/atlas';
import { inputDelayForRtt, Lockstep, soloLockstep } from './net/lockstep';
import {
  makeRoomCode, normaliseCode, randomSeed, type LobbyInfo, type NetMessage, type Transport,
} from './net/protocol';
import { hostRoom, joinRoom, type HostHandle } from './net/peer';
import { createState, type MatchConfig } from './sim/state';
import { GameScreen } from './ui/game';
import {
  lobbyStatusCard, renderHelp, renderHostWaiting, renderJoin, renderSetup, renderTitle,
  type LobbyModel,
} from './ui/menus';
import { clear, el, toast } from './ui/dom';

const PLAYER_NAMES = ['Player 1 (blue)', 'Player 2 (orange)'];
const START_GOLD = 280;

type Screen = 'title' | 'solo' | 'host' | 'join' | 'lobby' | 'game' | 'help';

class App {
  private ui = document.getElementById('ui') as HTMLElement;
  private canvas = document.getElementById('stage') as HTMLCanvasElement;

  private screen: Screen = 'title';
  private game: GameScreen | null = null;

  private transport: Transport | null = null;
  private handle: HostHandle | null = null;
  private isHost = false;
  private roomCode = '';
  private pingTimer = 0;
  private rttMs = 0;

  private setup = { heroId: 0, mapId: 0, difficulty: 0 };
  private peer: LobbyInfo = { name: PLAYER_NAMES[1], heroId: 1, ready: false };
  private selfReady = false;
  private lastMatch: { cfg: MatchConfig; inputDelay: number } | null = null;
  private joinError: string | null = null;
  private joinStatus: string | null = null;

  async boot(): Promise<void> {
    // Any first touch unlocks audio on iOS/Android.
    const unlock = (): void => {
      audio.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) music.setIntensity(0);
    });

    this.showLoading();
    try {
      await atlas.load();
    } catch {
      toast('Could not load the sprite sheet - check that /assets is deployed.');
    }

    const hashCode = normaliseCode(location.hash.replace('#', ''));
    if (hashCode.length >= 3) {
      this.showJoin(hashCode);
      window.setTimeout(() => this.doJoin(hashCode), 200);
    } else {
      this.showTitle();
    }
  }

  private showLoading(): void {
    clear(this.ui);
    this.ui.appendChild(
      el('div', { class: 'screen' },
        el('div', { class: 'stack' },
          el('div', { class: 'title' }, el('h1', {}, 'BULWARK')),
          el('div', { class: 'spinner' }),
          el('div', { class: 'muted', style: 'text-align:center' }, 'Loading…'))),
    );
  }

  // ================================================================ screens

  private showTitle(): void {
    this.teardownNet();
    this.screen = 'title';
    renderTitle(this.ui, {
      onSolo: () => this.showSoloSetup(),
      onHost: () => this.startHosting(),
      onJoin: () => this.showJoin(''),
      onHelp: () => {
        this.screen = 'help';
        renderHelp(this.ui, () => this.showTitle());
      },
    });
  }

  private showSoloSetup(): void {
    this.screen = 'solo';
    renderSetup(this.ui, {
      title: 'Solo run',
      confirmLabel: 'Start defending',
      model: this.setup,
      canEditMap: true,
      onChange: () => { /* local only */ },
      onBack: () => this.showTitle(),
      onConfirm: () => this.startSolo(),
    });
  }

  private showJoin(initial: string): void {
    this.screen = 'join';
    renderJoin(
      this.ui,
      initial,
      (code) => this.doJoin(code),
      () => this.showTitle(),
      this.joinStatus,
      this.joinError,
    );
  }

  // ================================================================ solo

  private startSolo(): void {
    const cfg: MatchConfig = {
      seed: randomSeed(),
      mapId: this.setup.mapId,
      players: [{ name: PLAYER_NAMES[0], heroId: this.setup.heroId }],
      startGold: START_GOLD,
      startLives: 0,
      difficulty: this.setup.difficulty,
    };
    const ls = soloLockstep(createState(cfg));
    this.lastMatch = { cfg, inputDelay: 1 };
    this.enterGame(ls, 0, false);
  }

  // ================================================================ hosting

  private startHosting(): void {
    this.teardownNet();
    this.isHost = true;
    this.roomCode = makeRoomCode(4);
    this.screen = 'host';
    renderHostWaiting(this.ui, this.roomCode, () => this.showTitle(), null);

    this.handle = hostRoom(
      this.roomCode,
      (t) => this.onConnected(t),
      (msg) => {
        if (this.screen === 'host') {
          renderHostWaiting(this.ui, this.roomCode, () => this.showTitle(), msg);
        }
      },
    );
  }

  private doJoin(rawCode: string): void {
    const code = normaliseCode(rawCode);
    this.teardownNet();
    this.isHost = false;
    this.roomCode = code;
    this.joinError = null;
    this.joinStatus = `Connecting to ${code}…`;
    this.showJoin(code);

    this.handle = joinRoom(
      code,
      (t) => this.onConnected(t),
      (msg) => {
        this.joinStatus = null;
        this.joinError = msg;
        if (this.screen === 'join') this.showJoin(code);
      },
    );
  }

  private onConnected(t: Transport): void {
    this.transport = t;
    this.joinStatus = null;
    t.onMessage = (msg) => this.onMessage(msg);
    t.onClose = (why) => this.onDisconnected(why);
    t.onError = () => { /* surfaced via onClose */ };

    t.send({ t: 'hello', v: 3, name: PLAYER_NAMES[this.isHost ? 0 : 1] });
    if (this.isHost) this.setup.heroId = 0;
    else if (this.setup.heroId === this.peer.heroId) this.setup.heroId = 1;

    this.selfReady = false;
    this.peer.ready = false;
    this.startPingLoop();
    this.showLobby();
  }

  private onDisconnected(why: string): void {
    if (this.game) {
      toast(why);
      this.game.destroy();
      this.game = null;
    }
    this.teardownNet();
    this.joinError = why;
    this.showTitle();
    toast(why, 3500);
  }

  private startPingLoop(): void {
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (this.game) return; // the lockstep driver takes over in-match
      this.transport?.send({ t: 'ping', s: performance.now() });
    }, 1000);
  }

  private teardownNet(): void {
    window.clearInterval(this.pingTimer);
    this.pingTimer = 0;
    if (this.transport) {
      this.transport.onMessage = null;
      this.transport.onClose = null;
      this.transport.onError = null;
    }
    this.handle?.cancel();
    this.transport?.close();
    this.handle = null;
    this.transport = null;
  }

  // ================================================================ lobby

  private showLobby(): void {
    this.screen = 'lobby';
    const model: LobbyModel = {
      code: this.roomCode,
      isHost: this.isHost,
      selfName: PLAYER_NAMES[this.isHost ? 0 : 1],
      peerName: PLAYER_NAMES[this.isHost ? 1 : 0],
      selfHero: this.setup.heroId,
      peerHero: this.peer.heroId,
      selfReady: this.selfReady,
      peerReady: this.peer.ready,
      mapId: this.setup.mapId,
      difficulty: this.setup.difficulty,
      rttMs: this.rttMs,
    };

    const bothReady = this.selfReady && this.peer.ready;
    const confirmLabel = this.isHost
      ? (bothReady ? '▶ Start the battle' : (this.selfReady ? 'Waiting for your partner…' : 'Ready up'))
      : (this.selfReady ? 'Waiting for the host…' : 'Ready up');

    renderSetup(this.ui, {
      title: 'Co-op lobby',
      confirmLabel,
      model: this.setup,
      canEditMap: this.isHost,
      takenHeroId: this.peer.heroId,
      extra: lobbyStatusCard(model),
      onChange: () => this.broadcastLobby(),
      onBack: () => this.showTitle(),
      onConfirm: () => {
        if (this.isHost && bothReady) {
          this.hostStartMatch();
          return;
        }
        this.selfReady = !this.selfReady;
        this.broadcastLobby();
        this.showLobby();
      },
    });
  }

  private broadcastLobby(): void {
    this.transport?.send({
      t: 'pick',
      heroId: this.setup.heroId,
      name: PLAYER_NAMES[this.isHost ? 0 : 1],
      ready: this.selfReady,
    });
    if (this.isHost) {
      this.transport?.send({
        t: 'lobby',
        players: [
          { name: PLAYER_NAMES[0], heroId: this.setup.heroId, ready: this.selfReady },
          this.peer,
        ],
        mapId: this.setup.mapId,
        difficulty: this.setup.difficulty,
        hostReady: this.selfReady,
      });
    }
  }

  private hostStartMatch(): void {
    const cfg: MatchConfig = {
      seed: randomSeed(),
      mapId: this.setup.mapId,
      players: [
        { name: PLAYER_NAMES[0], heroId: this.setup.heroId },
        { name: PLAYER_NAMES[1], heroId: this.peer.heroId },
      ],
      startGold: START_GOLD,
      startLives: 0,
      difficulty: this.setup.difficulty,
    };
    const inputDelay = inputDelayForRtt(this.rttMs);
    this.transport?.send({ t: 'start', match: cfg, inputDelay });
    this.beginNetworkedMatch(cfg, inputDelay);
  }

  private beginNetworkedMatch(cfg: MatchConfig, inputDelay: number): void {
    this.lastMatch = { cfg, inputDelay };
    const local = this.isHost ? 0 : 1;
    const ls = new Lockstep(createState(cfg), this.transport, {
      localPlayer: local,
      playerCount: 2,
      inputDelay,
      isHost: this.isHost,
    });
    this.enterGame(ls, local, true);
  }

  // ================================================================ match

  private enterGame(ls: Lockstep, localPlayer: number, multiplayer: boolean): void {
    this.screen = 'game';
    this.currentLockstep = ls;
    this.game?.destroy();
    clear(this.ui);
    audio.unlock();

    this.game = new GameScreen({
      root: this.ui,
      canvas: this.canvas,
      lockstep: ls,
      localPlayer,
      playerNames: PLAYER_NAMES,
      multiplayer,
      onLeave: () => {
        this.game?.destroy();
        this.game = null;
        this.currentLockstep = null;
        if (multiplayer) this.transport?.send({ t: 'bye', why: 'Your partner left the match.' });
        this.showTitle();
      },
      onRestart: () => this.restart(multiplayer),
    });
  }

  private restart(multiplayer: boolean): void {
    if (!multiplayer) {
      this.game?.destroy();
      this.game = null;
      this.startSolo();
      return;
    }
    if (!this.isHost) {
      toast('Only the host can start a new match.');
      return;
    }
    const prev = this.lastMatch;
    if (!prev) return;
    const cfg: MatchConfig = { ...prev.cfg, seed: randomSeed() };
    const inputDelay = inputDelayForRtt(this.rttMs);
    this.transport?.send({ t: 'start', match: cfg, inputDelay });
    this.game?.destroy();
    this.game = null;
    this.beginNetworkedMatch(cfg, inputDelay);
  }

  // ============================================================== messages

  private onMessage(msg: NetMessage): void {
    switch (msg.t) {
      case 'hello':
        this.peer.name = msg.name;
        if (this.isHost) this.broadcastLobby();
        break;

      case 'pick':
        this.peer.heroId = msg.heroId;
        this.peer.name = msg.name;
        this.peer.ready = msg.ready;
        if (this.screen === 'lobby') this.showLobby();
        break;

      case 'lobby':
        if (!this.isHost) {
          const host = msg.players[0];
          this.peer.heroId = host.heroId;
          this.peer.name = host.name;
          this.peer.ready = msg.hostReady;
          this.setup.mapId = msg.mapId;
          this.setup.difficulty = msg.difficulty;
          if (this.screen === 'lobby') this.showLobby();
        }
        break;

      case 'start':
        if (!this.isHost) this.beginNetworkedMatch(msg.match, msg.inputDelay);
        break;

      case 'ping':
        this.transport?.send({ t: 'pong', s: msg.s });
        if (this.game) this.gameLockstep()?.receive(msg);
        break;

      case 'pong':
        this.rttMs = Math.round(performance.now() - msg.s);
        if (this.game) this.gameLockstep()?.receive(msg);
        break;

      case 'bye':
        this.onDisconnected(msg.why);
        break;

      default:
        this.gameLockstep()?.receive(msg);
        break;
    }
  }

  private gameLockstep(): Lockstep | null {
    return this.currentLockstep;
  }

  private currentLockstep: Lockstep | null = null;
}

const app = new App();
void app.boot();

// Keep the canvas sized to the visual viewport (mobile browser chrome moves).
window.visualViewport?.addEventListener('resize', () => {
  window.dispatchEvent(new Event('resize'));
});
