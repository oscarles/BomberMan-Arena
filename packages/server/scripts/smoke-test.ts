import { pathToFileURL } from 'node:url';
import type { ClientMessage, ServerMessage } from '@bomberman/shared';
import { WebSocket } from 'ws';

/**
 * Test de fumée d'un serveur déployé : vérifie, depuis l'extérieur, qu'une vraie partie à deux
 * joueurs peut se jouer (santé HTTP, connexion WebSocket, salon privé, démarrage, déplacement
 * diffusé à l'autre joueur). Utilisable contre n'importe quelle adresse :
 * `npm run smoke -w @bomberman/server -- ws://1.2.3.4:8080`.
 */

/** Résultat d'une étape du test de fumée. */
export interface SmokeStep {
  name: string;
  ok: boolean;
  detail: string;
}

/** Bilan complet du test de fumée. */
export interface SmokeReport {
  ok: boolean;
  steps: SmokeStep[];
  /** Latence médiane aller-retour WebSocket (ms), `null` si non mesurée. */
  latencyMs: number | null;
}

/** Options du test de fumée. */
export interface SmokeOptions {
  /** Délai maximal d'attente de chaque réponse (ms). */
  timeoutMs?: number;
  /** Nombre d'allers-retours utilisés pour mesurer la latence. */
  pings?: number;
  /** Appelé à chaque étape terminée (affichage en direct). */
  onStep?: (step: SmokeStep) => void;
}

/** Adresses HTTP et WebSocket dérivées de ce que l'utilisateur a saisi. */
export interface ServerUrls {
  http: string;
  ws: string;
}

/**
 * Normalise une adresse saisie (`ws://`, `wss://`, `http://`, `https://` ou `hôte:port`)
 * en une paire d'URL HTTP / WebSocket sans slash final.
 */
export function resolveServerUrls(input: string): ServerUrls {
  const trimmed = input.trim().replace(/\/+$/, '');
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
  const url = new URL(withScheme);
  const secure = url.protocol === 'wss:' || url.protocol === 'https:';
  if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Protocole non supporté : ${url.protocol}`);
  }
  const host = url.host;
  return {
    http: `${secure ? 'https' : 'http'}://${host}`,
    ws: `${secure ? 'wss' : 'ws'}://${host}`,
  };
}

/** Client WebSocket minimal : file des messages reçus + attente d'un message précis. */
class SmokeClient {
  private readonly received: ServerMessage[] = [];
  private readonly waiters = new Set<() => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw: Buffer) => {
      this.received.push(JSON.parse(raw.toString()) as ServerMessage);
      for (const wake of this.waiters) wake();
    });
  }

  /** Ouvre une connexion et attend qu'elle soit établie. */
  static connect(url: string, timeoutMs: number): Promise<SmokeClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { handshakeTimeout: timeoutMs });
      const client = new SmokeClient(socket);
      socket.once('open', () => resolve(client));
      socket.once('error', (err) => reject(err));
    });
  }

  /** Envoie un message client. */
  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Attend (et consomme) le premier message, déjà reçu ou à venir, satisfaisant `predicate`. */
  waitFor<T extends ServerMessage>(
    predicate: (m: ServerMessage) => m is T,
    timeoutMs: number,
    what: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const check = (): boolean => {
        const index = this.received.findIndex(predicate);
        if (index === -1) return false;
        const [message] = this.received.splice(index, 1);
        cleanup();
        resolve(message as T);
        return true;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`pas de réponse ${what} après ${timeoutMs} ms`));
      }, timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timer);
        this.waiters.delete(wake);
      };
      const wake = (): void => void check();
      this.waiters.add(wake);
      check();
    });
  }

  /** Ferme la connexion. */
  close(): void {
    this.socket.close();
  }
}

/** Garde de type sur le champ `type` d'un message serveur. */
function ofType<K extends ServerMessage['type']>(type: K) {
  return (m: ServerMessage): m is Extract<ServerMessage, { type: K }> => m.type === type;
}

/** Médiane d'une liste de nombres (non vide). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Message d'erreur lisible, y compris pour les erreurs réseau de Node (`cause.code`). */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string } }).cause;
  const code = (err as Error & { code?: string }).code ?? cause?.code;
  return code ? `${err.message} (${code})` : err.message;
}

/**
 * Exécute le test de fumée contre `input` et renvoie un bilan étape par étape.
 * Ne lève jamais : toute erreur est rapportée comme une étape en échec.
 */
export async function runSmokeTest(
  input: string,
  options: SmokeOptions = {},
): Promise<SmokeReport> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const pings = options.pings ?? 5;
  const steps: SmokeStep[] = [];
  const clients: SmokeClient[] = [];
  let latencyMs: number | null = null;

  const record = (name: string, ok: boolean, detail: string): void => {
    const step = { name, ok, detail };
    steps.push(step);
    options.onStep?.(step);
  };

  /** Exécute une étape ; renvoie `false` (et arrête le test) en cas d'échec. */
  const step = async (name: string, run: () => Promise<string>): Promise<boolean> => {
    try {
      record(name, true, await run());
      return true;
    } catch (err) {
      record(name, false, describeError(err));
      return false;
    }
  };

  let urls: ServerUrls;
  try {
    urls = resolveServerUrls(input);
  } catch (err) {
    record('Adresse du serveur', false, describeError(err));
    return { ok: false, steps, latencyMs };
  }

  let host!: SmokeClient;
  let guest!: SmokeClient;
  let hostId = '';
  let inviteCode = '';
  let spawnX = 0;

  try {
    const passed =
      (await step('Santé HTTP (/health)', async () => {
        const res = await fetch(`${urls.http}/health`, { signal: AbortSignal.timeout(timeoutMs) });
        const body = (await res.json()) as { status?: string };
        if (!res.ok || body.status !== 'ok')
          throw new Error(`réponse inattendue (HTTP ${res.status})`);
        return `${urls.http}/health → ok`;
      })) &&
      (await step('Connexion WebSocket (2 joueurs)', async () => {
        const start = Date.now();
        host = await SmokeClient.connect(urls.ws, timeoutMs);
        clients.push(host);
        guest = await SmokeClient.connect(urls.ws, timeoutMs);
        clients.push(guest);
        const welcome = await host.waitFor(ofType('WELCOME'), timeoutMs, 'WELCOME');
        await guest.waitFor(ofType('WELCOME'), timeoutMs, 'WELCOME');
        hostId = welcome.payload.playerId;
        return `${urls.ws} en ${Date.now() - start} ms`;
      })) &&
      (await step('Latence', async () => {
        const samples: number[] = [];
        for (let i = 0; i < pings; i++) {
          const start = performance.now();
          host.send({ type: 'LIST_LOBBIES', payload: {} });
          await host.waitFor(ofType('LOBBY_LIST'), timeoutMs, 'LOBBY_LIST');
          samples.push(performance.now() - start);
        }
        latencyMs = Math.round(median(samples));
        if (latencyMs > 150) throw new Error(`${latencyMs} ms (médiane) : trop élevée pour jouer`);
        return `${latencyMs} ms (médiane sur ${pings} allers-retours)`;
      })) &&
      (await step('Création d’un salon privé', async () => {
        host.send({ type: 'SET_NAME', payload: { name: 'smoke-hote' } });
        host.send({ type: 'CREATE_LOBBY', payload: { name: 'smoke-test', visibility: 'PRIVATE' } });
        const updated = await host.waitFor(ofType('LOBBY_UPDATED'), timeoutMs, 'LOBBY_UPDATED');
        inviteCode = updated.payload.lobby.inviteCode ?? '';
        if (!inviteCode) throw new Error("le salon privé n'a pas de code d'invitation");
        return `code d'invitation ${inviteCode}`;
      })) &&
      (await step('Un 2e joueur rejoint le salon', async () => {
        guest.send({ type: 'SET_NAME', payload: { name: 'smoke-invite' } });
        guest.send({ type: 'JOIN_LOBBY', payload: { inviteCode } });
        const twoPlayers = (
          m: ServerMessage,
        ): m is Extract<ServerMessage, { type: 'LOBBY_UPDATED' }> =>
          m.type === 'LOBBY_UPDATED' && m.payload.lobby.players.length === 2;
        await host.waitFor(twoPlayers, timeoutMs, 'LOBBY_UPDATED (2 joueurs)');
        return 'les 2 joueurs voient le même salon';
      })) &&
      (await step('Démarrage de la partie', async () => {
        host.send({ type: 'START_GAME', payload: {} });
        const [started] = await Promise.all([
          host.waitFor(ofType('ROUND_STARTED'), timeoutMs, 'ROUND_STARTED'),
          guest.waitFor(ofType('ROUND_STARTED'), timeoutMs, 'ROUND_STARTED'),
        ]);
        const { grid, players } = started.payload.snapshot;
        const me = players.find((p) => p.id === hostId);
        if (!me) throw new Error("l'hôte est absent de la manche");
        spawnX = me.x;
        return `manche lancée (grille ${grid[0].length}×${grid.length}, ${players.length} joueurs)`;
      })) &&
      (await step('Déplacement synchronisé (A bouge, B le voit)', async () => {
        // Les joueurs apparaissent dans les coins, zone dégagée : on s'éloigne du bord.
        host.send({ type: 'MOVE', payload: { direction: spawnX === 1 ? 'RIGHT' : 'LEFT' } });
        const isHostMove = (
          m: ServerMessage,
        ): m is Extract<ServerMessage, { type: 'POSITION_UPDATED' }> =>
          m.type === 'POSITION_UPDATED' && m.payload.playerId === hostId;
        const moved = await guest.waitFor(
          isHostMove,
          timeoutMs,
          "POSITION_UPDATED chez l'autre joueur",
        );
        return `l'invité reçoit la position de l'hôte (${moved.payload.x}, ${moved.payload.y})`;
      }));

    return { ok: passed, steps, latencyMs };
  } finally {
    for (const client of clients) client.close();
  }
}

/** Point d'entrée en ligne de commande : affiche le bilan et sort en code 1 en cas d'échec. */
async function main(): Promise<void> {
  const target = process.argv[2] ?? process.env.SMOKE_URL ?? 'ws://localhost:8080';
  console.log(`\nTest de fumée du serveur : ${target}\n`);
  const report = await runSmokeTest(target, {
    onStep: (s) => console.log(`  ${s.ok ? '✔' : '✘'} ${s.name} — ${s.detail}`),
  });
  console.log(
    report.ok
      ? '\n✅ Serveur jouable : vos amis peuvent se connecter à cette adresse.\n'
      : '\n❌ Serveur non jouable depuis cette machine (voir l’étape en échec ci-dessus).\n',
  );
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
