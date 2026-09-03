import { MODULE_ID, SOCKET_NAME } from '../constants.mjs';

/**
 * Autoridade de sincronização multiplayer. Só GM (ou usuários listados em
 * `djUserIds`) podem emitir comandos de transporte; todo client valida a
 * autorização do remetente antes de aplicar, nunca confiando apenas no
 * client de origem.
 *
 * Importante: `game.socket.emit()` do Foundry NÃO faz "echo" pro próprio
 * remetente — por isso cada comando também é aplicado localmente (`_apply`)
 * na hora de disparar, além de emitido pra rede.
 */
export class SyncManager {
  constructor() {
    this.engine = null;
  }

  isAuthorized(user = game.user) {
    if (user.isGM) return true;
    const djIds = game.settings.get(MODULE_ID, 'djUserIds') ?? [];
    return djIds.includes(user.id);
  }

  registerSocketHandlers(engine) {
    this.engine = engine;
    game.socket.on(SOCKET_NAME, (payload) => this._handleRemoteMessage(payload));
  }

  _handleRemoteMessage(payload) {
    const sender = game.users.get(payload.userId);
    const djIds = game.settings.get(MODULE_ID, 'djUserIds') ?? [];
    const senderIsAuthorized = sender?.isGM || djIds.includes(payload.userId);
    if (!senderIsAuthorized) return;
    this._apply(payload);
  }

  _apply(payload) {
    switch (payload.type) {
      case 'loadLayer': return this.engine.applyRemoteLoadLayer(payload);
      case 'play': return this.engine.applyRemotePlay(payload);
      case 'pause': return this.engine.applyRemotePause(payload);
      case 'seek': return this.engine.applyRemoteSeek(payload);
      case 'stopLayer': return this.engine.applyRemoteStopLayer(payload);
      case 'setLayerVolume': return this.engine.applyRemoteSetLayerVolume(payload);
    }
  }

  _dispatch(type, data) {
    if (!this.isAuthorized()) {
      ui.notifications?.warn(game.i18n.localize(`${MODULE_ID}.warnings.notAuthorized`));
      return null;
    }
    const payload = { type, userId: game.user.id, ts: Date.now(), ...data };
    game.socket.emit(SOCKET_NAME, payload);
    this._apply(payload);
    return payload;
  }

  loadLayer(layer, playlistId, trackId) { return this._dispatch('loadLayer', { layer, playlistId, trackId }); }
  play(layer) { return this._dispatch('play', { layer }); }
  pause(layer) { return this._dispatch('pause', { layer }); }
  seek(layer, seconds) { return this._dispatch('seek', { layer, seconds }); }
  stopLayer(layer) { return this._dispatch('stopLayer', { layer }); }
  setLayerVolume(layer, volume) { return this._dispatch('setLayerVolume', { layer, volume }); }
}
