import { MAX_PLAYERS_LIMIT } from '@bomberman/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameError } from '../src/errors.js';
import { LobbyManager } from '../src/lobby/LobbyManager.js';

describe('LobbyManager', () => {
  let manager: LobbyManager;

  beforeEach(() => {
    manager = new LobbyManager();
  });

  it('crée un salon public : le créateur en devient automatiquement hôte', () => {
    const lobby = manager.createLobby('p1', 'Alice', 'Arène', 'PUBLIC');
    expect(lobby.hostId).toBe('p1');
    expect(lobby.inviteCode).toBeNull();
    expect(manager.listPublicLobbies()).toHaveLength(1);
  });

  it('génère un code pour un salon privé et le rend rejoignable uniquement par ce code', () => {
    const lobby = manager.createLobby('p1', 'Alice', 'Secret', 'PRIVATE');
    expect(lobby.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(manager.listPublicLobbies()).toHaveLength(0);

    expect(() => manager.joinLobby('p2', 'Bob', { inviteCode: 'XXXXXX' })).toThrow(GameError);
    const joined = manager.joinLobby('p2', 'Bob', { inviteCode: lobby.inviteCode! });
    expect(joined.players).toHaveLength(2);
  });

  it('refuse de rejoindre un salon plein', () => {
    const lobby = manager.createLobby('host', 'Host', 'Full', 'PUBLIC', {
      maxPlayers: 2,
    });
    manager.joinLobby('p2', 'B', { lobbyId: lobby.id });
    expect(() => manager.joinLobby('p3', 'C', { lobbyId: lobby.id })).toThrow(GameError);
  });

  it('attribue une couleur différente à chaque joueur et refuse les doublons', () => {
    const lobby = manager.createLobby('host', 'Host', 'Couleurs', 'PUBLIC');
    manager.joinLobby('p2', 'B', { lobbyId: lobby.id });
    const [host, guest] = lobby.players;
    expect(host!.color).not.toBe(guest!.color);
    expect(() => manager.setColor('p2', host!.color)).toThrow(GameError);
  });

  it("promeut un nouvel hôte quand l'hôte quitte le salon", () => {
    const lobby = manager.createLobby('host', 'Host', 'Relai', 'PUBLIC');
    manager.joinLobby('p2', 'B', { lobbyId: lobby.id });
    manager.leaveLobby('host');
    expect(lobby.hostId).toBe('p2');
  });

  it('supprime le salon quand le dernier joueur part', () => {
    const lobby = manager.createLobby('host', 'Host', 'Vide', 'PUBLIC');
    manager.leaveLobby('host');
    expect(manager.getLobbyOf('host')).toBeUndefined();
    expect(() => manager.joinLobby('p2', 'B', { lobbyId: lobby.id })).toThrow(GameError);
  });

  it('refuse à un non-hôte de modifier les réglages ou de démarrer la partie', () => {
    const lobby = manager.createLobby('host', 'Host', 'Règles', 'PUBLIC');
    manager.joinLobby('p2', 'B', { lobbyId: lobby.id });
    expect(() => manager.updateSettings('p2', { lives: 5 })).toThrow(GameError);
    expect(() => manager.startGame('p2')).toThrow(GameError);
  });

  it('borne les réglages hors limites (ex. maxPlayers) dans les valeurs autorisées', () => {
    const lobby = manager.createLobby('host', 'Host', 'Bornes', 'PUBLIC', {
      maxPlayers: 999,
    });
    expect(lobby.settings.maxPlayers).toBe(MAX_PLAYERS_LIMIT);
  });

  it('refuse de démarrer sans le nombre minimal de joueurs', () => {
    const lobby = manager.createLobby('host', 'Host', 'Seul', 'PUBLIC');
    expect(() => manager.startGame('host')).toThrow(GameError);
    manager.joinLobby('p2', 'B', { lobbyId: lobby.id });
    expect(() => manager.startGame('host')).not.toThrow();
    expect(lobby.status).toBe('IN_GAME');
  });

  it('remet le salon en attente à la fin de la partie (persistance du lobby)', () => {
    const lobby = manager.createLobby('host', 'Host', 'Persist', 'PUBLIC');
    manager.joinLobby('p2', 'B', { lobbyId: lobby.id });
    manager.startGame('host');
    const reverted = manager.endGame(lobby.id);
    expect(reverted?.status).toBe('WAITING');
    expect(reverted?.players).toHaveLength(2);
  });
});
