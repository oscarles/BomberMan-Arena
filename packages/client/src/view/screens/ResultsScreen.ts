import type { LeaderboardEntry } from '@bomberman/shared';
import { esc, iconHtml, setHtml } from '../ui/dom';
import { spriteHtml } from '../ui/sprites';
import type { Screen, ScreenContext } from './Screen';

const CONFETTI = ['#ffd23a', '#e5281c', '#3fc73a', '#ffffff', '#4888f8', '#ff9500'];

interface RoundResult {
  roundNumber: number;
  winnerId: string | null;
}

/** Fin de partie : vainqueur, podium, tableau des scores détaillé et rappel des manches. */
export class ResultsScreen implements Screen {
  readonly id = 'results' as const;
  readonly element = document.createElement('section');
  private history: RoundResult[] = [];
  private names = new Map<string, { name: string; color: LeaderboardEntry['color'] }>();
  private confetti: HTMLCanvasElement | null = null;
  private confettiRaf = 0;

  constructor(private readonly ctx: ScreenContext) {
    this.element.className = 'screen';
    this.element.addEventListener('click', (event) => this.onClick(event));
    ctx.model.events.on('roundStarted', (round) => {
      if (round.roundNumber === 1) this.history = [];
      for (const p of round.players.values())
        this.names.set(p.id, { name: p.name, color: p.color });
    });
    ctx.model.events.on('roundEnded', ({ roundNumber, winnerId }) =>
      this.history.push({ roundNumber, winnerId }),
    );
    ctx.model.events.on('gameEnded', () => this.render());
  }

  onShow(): void {
    this.render();
    this.ctx.sfx.play('victory');
    this.startConfetti();
  }

  onHide(): void {
    cancelAnimationFrame(this.confettiRaf);
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target) return;
    this.ctx.sfx.play('click');
    if (target.dataset.act === 'replay') this.ctx.navigate('room');
    if (target.dataset.act === 'quit') this.ctx.controller.leaveLobby();
  }

  private render(): void {
    const board = this.ctx.model.leaderboard;
    const myId = this.ctx.model.playerId;
    const champion = board[0];
    const totalRounds = this.history.length;
    const podiumOrder = [1, 0, 2, 3].filter((i) => board[i]);
    const podium = podiumOrder
      .map((i) => {
        const e = board[i] as LeaderboardEntry;
        const anim = e.rank === 1 ? 'cheer' : e.rank === 4 ? 'ko' : 'idle';
        return `<div class="pcol p${e.rank}">${spriteHtml(e.color, anim, 5, e.rank === 1)}<div class="nameplate">${esc(e.name)}</div><div class="pblock">${e.rank}</div></div>`;
      })
      .join('');
    const rows = board
      .map((e) => {
        const wins = Array.from(
          { length: Math.max(totalRounds, e.wins) },
          (_, k) => `<i class="${k < e.wins ? 'on' : ''}"></i>`,
        ).join('');
        return `<div class="brow${e.rank === 1 ? ' first' : ''}${e.playerId === myId ? ' me' : ''}">
          <span class="rank">${e.rank}</span>
          <div class="player">${spriteHtml(e.color, 'head', 3)}<span class="pn">${esc(e.name)}<small>${e.playerId === myId ? 'TOI' : e.left ? 'A QUITTÉ' : ''}</small></span></div>
          <div class="wins">${wins}</div>
          <span class="num">${e.kills}</span><span class="num">${e.livesLost}</span><span class="num">${e.bombsPlaced}</span><span class="num">${e.itemsCollected}</span>
        </div>`;
      })
      .join('');
    const history = this.history
      .map((r) => {
        const info = r.winnerId ? this.names.get(r.winnerId) : undefined;
        return `<div class="round">${info ? spriteHtml(info.color, 'cheer', 3) : ''}<div><b>MANCHE ${r.roundNumber}</b><span>${info ? `${esc(info.name)} gagne` : 'Égalité'}</span></div></div>`;
      })
      .join('');

    setHtml(
      this.element,
      `
      <div class="box victory">
        <canvas id="confetti" aria-hidden="true"></canvas>
        <div class="victory-top">
          <div class="burst-wrap" data-burst="26"><div class="burst"></div></div>
          <p class="label">Fin de la partie${totalRounds ? ` · ${totalRounds} manche${totalRounds > 1 ? 's' : ''}` : ''}</p>
          <h2 class="big">${champion ? `${esc(champion.name)} GAGNE !` : 'FIN DE PARTIE'}</h2>
          ${champion ? `<p class="sub">${champion.wins} manche${champion.wins > 1 ? 's' : ''} gagnée${champion.wins > 1 ? 's' : ''}</p>` : ''}
        </div>
        <div class="podium">${podium}</div>
      </div>
      <div class="box">
        <div class="box-head"><h3 class="label">Classement détaillé</h3></div>
        <div class="list-scroll"><div class="board">
          <div class="brow hd label"><span>#</span><span>Joueur</span><span>${iconHtml('trophy', 2)}Manches</span><span>${iconHtml('skull', 2)}Élim.</span><span>${iconHtml('heart', 2)}Vies perdues</span><span>${iconHtml('bomb', 2)}Bombes</span><span>${iconHtml('star', 2)}Objets</span></div>
          ${rows}
        </div></div>
      </div>
      ${history ? `<div class="history">${history}</div>` : ''}
      <div class="actions">
        <button class="btn go big" type="button" data-act="replay"><span data-icon="play" data-s="2"></span>Rejouer dans le salon</button>
        <button class="btn ghost" type="button" data-act="quit">Quitter le salon</button>
        <p class="note">Le salon reste actif : mêmes joueurs, mêmes règles.</p>
      </div>`,
    );
    this.buildBursts();
    this.confetti = this.element.querySelector('#confetti');
  }

  private buildBursts(): void {
    this.element.querySelectorAll<HTMLElement>('[data-burst]').forEach((wrap) => {
      const n = Number(wrap.dataset.burst);
      const points: string[] = [];
      for (let i = 0; i < n * 2; i++) {
        const angle = (Math.PI * i) / n - Math.PI / 2;
        const radius = i % 2 ? 36 : i % 4 === 0 ? 50 : 44;
        points.push(
          `${(50 + radius * Math.cos(angle)).toFixed(1)}% ${(50 + radius * Math.sin(angle)).toFixed(1)}%`,
        );
      }
      (wrap.firstElementChild as HTMLElement).style.clipPath = `polygon(${points.join(',')})`;
    });
  }

  /** Confettis pixel qui tombent sur le panneau du vainqueur. */
  private startConfetti(): void {
    cancelAnimationFrame(this.confettiRaf);
    const canvas = this.confetti;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const pieces = Array.from({ length: 70 }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height,
      size: 4 + Math.floor(Math.random() * 3) * 2,
      speed: 1.2 + Math.random() * 2,
      sway: Math.random() * 6,
      color: CONFETTI[i % CONFETTI.length] ?? '#fff',
    }));
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const piece of pieces) {
        piece.y += piece.speed;
        piece.sway += 0.05;
        if (piece.y > canvas.height) {
          piece.y = -10;
          piece.x = Math.random() * canvas.width;
        }
        ctx.fillStyle = piece.color;
        ctx.fillRect(
          Math.round(piece.x + Math.sin(piece.sway) * 12),
          Math.round(piece.y),
          piece.size,
          piece.size,
        );
      }
      this.confettiRaf = requestAnimationFrame(loop);
    };
    loop();
  }
}
