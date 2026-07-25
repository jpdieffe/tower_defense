import { HEROES } from '../content/heroes';
import { MAPS } from '../content/maps';
import { TOWERS } from '../content/towers';
import { DIFFICULTIES } from '../sim/state';
import { copyToClipboard, clear, el, tapButton, toast } from './dom';

export interface TitleHandlers {
  onSolo: () => void;
  onHost: () => void;
  onJoin: () => void;
  onHelp: () => void;
}

export function renderTitle(root: HTMLElement, h: TitleHandlers): void {
  clear(root);
  root.appendChild(
    el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'stack' },
        el(
          'div',
          { class: 'title' },
          el('h1', {}, 'BULWARK'),
          el('p', {}, 'Two players. One keep. Endless waves.'),
        ),
        tapButton('btn primary', h.onHost, '🤝 Host a co-op game'),
        tapButton('btn warm', h.onJoin, '🔗 Join with a code'),
        tapButton('btn ghost', h.onSolo, '🎯 Play solo'),
        tapButton('btn ghost', h.onHelp, '❔ How to play'),
        el(
          'div',
          { class: 'muted', style: 'text-align:center' },
          'Runs in any modern phone browser — no install, no account. '
          + 'Both phones simulate the battle in perfect lockstep, so you always see the same fight.',
        ),
      ),
    ),
  );
}

export interface SetupModel {
  heroId: number;
  mapId: number;
  difficulty: number;
}

export interface SetupHandlers {
  title: string;
  confirmLabel: string;
  model: SetupModel;
  canEditMap: boolean;
  onChange: () => void;
  onConfirm: () => void;
  onBack: () => void;
  /** Hero already chosen by the other player, if any. */
  takenHeroId?: number;
  extra?: HTMLElement | null;
}

export function renderSetup(root: HTMLElement, h: SetupHandlers): void {
  clear(root);
  const model = h.model;

  const heroGrid = el('div', { class: 'chooser' });
  for (const hero of HEROES) {
    const taken = h.takenHeroId === hero.id;
    const btn = tapButton(
      `choice${model.heroId === hero.id ? ' selected' : ''}`,
      () => {
        model.heroId = hero.id;
        h.onChange();
        renderSetup(root, h);
      },
      el('div', { class: 'name' }, hero.name),
      el('div', { class: 'sub' }, hero.title),
      el('div', { class: 'sub' }, hero.desc),
      el('div', { class: 'sub', style: 'color:#ffd447' }, `${hero.passiveName}: ${hero.passiveDesc}`),
      el('div', { class: 'sub' }, `⚡ ${hero.ability.name} — ${hero.ability.desc}`),
      taken ? el('div', { class: 'taken' }, 'ALLY') : null,
    );
    heroGrid.appendChild(btn);
  }

  const mapGrid = el('div', { class: 'chooser' });
  for (const m of MAPS) {
    mapGrid.appendChild(
      tapButton(
        `choice${model.mapId === m.id ? ' selected' : ''}`,
        () => {
          if (!h.canEditMap) return;
          model.mapId = m.id;
          h.onChange();
          renderSetup(root, h);
        },
        el('div', { class: 'name' }, m.name),
        el('div', { class: 'sub' }, m.blurb),
        el('div', { class: 'sub' }, `${m.lanes.length} lane${m.lanes.length > 1 ? 's' : ''}`),
      ),
    );
  }

  const diffGrid = el('div', { class: 'chooser' });
  DIFFICULTIES.forEach((d, i) => {
    diffGrid.appendChild(
      tapButton(
        `choice${model.difficulty === i ? ' selected' : ''}`,
        () => {
          if (!h.canEditMap) return;
          model.difficulty = i;
          h.onChange();
          renderSetup(root, h);
        },
        el('div', { class: 'name' }, d.name),
        el('div', { class: 'sub' }, `${d.lives} lives · enemies at ${d.hpPct}% health`),
      ),
    );
  });

  root.appendChild(
    el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'stack' },
        el('div', { class: 'title' }, el('h1', { style: 'font-size:34px' }, h.title)),
        h.extra ?? null,
        el('div', { class: 'card' }, el('h2', {}, 'Choose your hero'), heroGrid),
        el(
          'div',
          { class: 'card' },
          el('h2', {}, h.canEditMap ? 'Battlefield' : 'Battlefield (host decides)'),
          mapGrid,
          el('h3', {}, 'Difficulty'),
          diffGrid,
        ),
        tapButton('btn primary', h.onConfirm, h.confirmLabel),
        tapButton('btn ghost', h.onBack, 'Back'),
      ),
    ),
  );
}

export function renderHostWaiting(
  root: HTMLElement,
  code: string,
  onCancel: () => void,
  error: string | null,
): void {
  clear(root);
  const link = `${location.origin}${location.pathname}#${code}`;
  root.appendChild(
    el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'stack' },
        el('div', { class: 'title' }, el('h1', { style: 'font-size:32px' }, 'Room open')),
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'Share this code'),
          el('div', { class: 'room-code' }, code),
          el('div', { class: 'muted' }, 'Your friend taps “Join with a code” and types this in.'),
          el('div', { class: 'btn-row', style: 'margin-top:12px' },
            tapButton('btn ghost', async () => {
              const ok = await copyToClipboard(code);
              toast(ok ? 'Code copied' : 'Copy failed — read it out instead');
            }, 'Copy code'),
            tapButton('btn ghost', async () => {
              const shareData = { title: 'Bulwark', text: `Join my Bulwark game — code ${code}`, url: link };
              if (navigator.share) {
                try { await navigator.share(shareData); return; } catch { /* cancelled */ }
              }
              const ok = await copyToClipboard(link);
              toast(ok ? 'Link copied' : 'Sharing is not supported here');
            }, 'Share link'),
          ),
        ),
        error
          ? el('div', { class: 'card' }, el('div', { class: 'error-text' }, error))
          : el(
            'div',
            { class: 'card' },
            el('div', { class: 'spinner' }),
            el('div', { class: 'muted', style: 'text-align:center' }, 'Waiting for your partner to connect…'),
          ),
        tapButton('btn ghost', onCancel, 'Cancel'),
      ),
    ),
  );
}

export function renderJoin(
  root: HTMLElement,
  initial: string,
  onSubmit: (code: string) => void,
  onCancel: () => void,
  status: string | null,
  error: string | null,
): void {
  clear(root);
  const input = el('input', {
    type: 'text',
    class: 'code',
    maxlength: 6,
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: false,
    inputmode: 'text',
    placeholder: '····',
    value: initial,
  }) as HTMLInputElement;

  const submit = (): void => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 3) {
      toast('Enter the code your friend gave you');
      return;
    }
    onSubmit(code);
  };

  input.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') submit();
  });

  root.appendChild(
    el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'stack' },
        el('div', { class: 'title' }, el('h1', { style: 'font-size:32px' }, 'Join a game')),
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'Room code'),
          input,
          error ? el('div', { class: 'error-text', style: 'margin-top:10px' }, error) : null,
          status ? el('div', { class: 'spinner' }) : null,
          status ? el('div', { class: 'muted', style: 'text-align:center' }, status) : null,
        ),
        tapButton('btn primary', submit, 'Connect'),
        tapButton('btn ghost', onCancel, 'Back'),
      ),
    ),
  );
  window.setTimeout(() => input.focus(), 60);
}

export function renderHelp(root: HTMLElement, onBack: () => void): void {
  clear(root);
  const towerList = el('div', {});
  for (const t of TOWERS) {
    towerList.appendChild(
      el(
        'div',
        { style: 'margin-bottom:8px' },
        el('div', { style: `font-weight:800;color:${t.accent}` }, `${t.name} — ${t.cost}g`),
        el('div', { class: 'muted' }, `${t.role}. ${t.desc}`),
        el('div', { class: 'muted', style: 'font-size:11.5px' },
          `Tier 4 choice: ${t.branches[0].name} (${t.branches[0].desc}) or ${t.branches[1].name} (${t.branches[1].desc})`),
      ),
    );
  }

  root.appendChild(
    el(
      'div',
      { class: 'screen' },
      el(
        'div',
        { class: 'stack' },
        el('div', { class: 'title' }, el('h1', { style: 'font-size:32px' }, 'How to play')),
        el(
          'div',
          { class: 'card' },
          el('h2', {}, 'The basics'),
          el('div', { class: 'muted' },
            'Enemies march from the edges of the map to your keep. Every one that reaches it costs you lives. '
            + 'Build towers on the green tiles beside the road to stop them.'),
          el('h3', {}, 'Controls'),
          el('div', { class: 'muted' },
            '• Pick a tower from the bar, drag onto a green tile and release to build.\n'
            + '• Tap a tower to open it: upgrade, change targeting, or sell it.\n'
            + '• Tap open ground to send your hero there.\n'
            + '• Tap the skill button to use your hero ability (some need you to drag and aim).\n'
            + '• Between waves, open the shop for relics and consumables.',
            ),
          el('h3', {}, 'Co-op rules'),
          el('div', { class: 'muted' },
            'You each have your own gold and your own towers, but you share the keep’s lives. '
            + 'Both players must press READY to call the next wave early — and calling it early pays a bonus.'),
          el('h3', {}, 'Why it never desyncs'),
          el('div', { class: 'muted' },
            'Both phones run the exact same simulation from the same seed, using integer maths only. '
            + 'A tick is never simulated until both players’ inputs for it have arrived, so a bullet that '
            + 'hits on your screen always hits on theirs. If the network hiccups you will see a brief '
            + '“waiting for your partner” pause instead of two different games.'),
        ),
        el('div', { class: 'card' }, el('h2', {}, 'Towers'), towerList),
        tapButton('btn primary', onBack, 'Back'),
      ),
    ),
  );
}

export interface LobbyModel {
  code: string;
  isHost: boolean;
  selfName: string;
  peerName: string;
  selfHero: number;
  peerHero: number;
  selfReady: boolean;
  peerReady: boolean;
  mapId: number;
  difficulty: number;
  rttMs: number;
}

export function lobbyStatusCard(m: LobbyModel): HTMLElement {
  const dot = (color: string): HTMLElement => el('span', { class: 'dot', style: `background:${color}` });
  return el(
    'div',
    { class: 'card' },
    el('h2', {}, `Room ${m.code}`),
    el(
      'div',
      { class: 'legend' },
      el('div', {}, dot('#4aa3ff'), `${m.isHost ? m.selfName : m.peerName} ${(m.isHost ? m.selfReady : m.peerReady) ? '✅' : '…'}`),
      el('div', {}, dot('#ff9a3c'), `${m.isHost ? m.peerName : m.selfName} ${(m.isHost ? m.peerReady : m.selfReady) ? '✅' : '…'}`),
      el('div', {}, `📶 ${m.rttMs}ms`),
    ),
    el('div', { class: 'muted', style: 'margin-top:8px' },
      m.isHost
        ? 'You are player 1 (blue). Pick the map and difficulty, then start when you are both ready.'
        : 'You are player 2 (orange). The host picks the map and difficulty.'),
  );
}
