var CARD_W = 60;
var CARD_H = 86;
var SUIT_SYM = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
var SUIT_CLR = { hearts: '#e74c3c', diamonds: '#e74c3c', clubs: '#222', spades: '#222' };
var SUIT_CLR_LIGHT = { hearts: '#ff6b6b', diamonds: '#ff6b6b', clubs: '#88aacc', spades: '#88aacc' };
var CW = 420, CH = 720;

function computePositions(n) {
  var cx = CW / 2, cy = 255;
  var nameRx = 165, nameRy = 210;
  var trickRx = 82, trickRy = 75;
  var cardRx = 165, cardRy = 175;
  var names = {}, tricks = {}, cards = {};

  for (var i = 0; i < n; i++) {
    var angle = (Math.PI / 2) + (2 * Math.PI * i / n);
    var cosA = Math.cos(angle), sinA = Math.sin(angle);
    names[i] = { x: cx - cosA * nameRx, y: cy + sinA * nameRy };
    tricks[i] = { x: cx - cosA * trickRx, y: cy + sinA * trickRy };
    cards[i] = { x: cx - cosA * cardRx, y: cy + sinA * cardRy };
  }

  names[0] = { x: cx, y: 580 };
  tricks[0] = { x: cx, y: 365 };
  cards[0] = { x: cx, y: 490 };

  for (var j = 1; j < n; j++) {
    if (names[j].y < 58) names[j].y = 58;
    if (cards[j].y < 95) cards[j].y = 95;
  }

  return { names: names, tricks: tricks, cards: cards };
}

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    window.euchreGameScene = this;
    this.dynamicObjects = [];
    this.wantAlone = false;
    this.playerLabels = {};
    this.prevPlayerCount = 0;
    this.positions = null;

    this._drawBackground();
    this._createStaticUI();

    if (window.euchrePendingState) {
      this.updateGameState(window.euchrePendingState);
      window.euchrePendingState = null;
    }
  }

  _drawBackground() {
    var bg = this.add.graphics();
    bg.fillGradientStyle(0x1a5c2e, 0x1a5c2e, 0x0e3a1c, 0x0e3a1c);
    bg.fillRect(0, 0, CW, CH);
    bg.fillStyle(0x1e6b35, 0.25);
    bg.fillRoundedRect(18, 100, CW - 36, 280, 30);
    bg.lineStyle(2, 0x2d8a48, 0.35);
    bg.strokeRoundedRect(18, 100, CW - 36, 280, 30);
  }

  _createStaticUI() {
    this.scoreText = this.add.text(CW / 2, 12, '', {
      fontSize: '14px', color: '#fff', fontStyle: 'bold', fontFamily: 'Arial',
      wordWrap: { width: CW - 20 }, align: 'center'
    }).setOrigin(0.5, 0);
    this.trumpDisplay = this.add.text(CW / 2, 30, '', {
      fontSize: '15px', color: '#FFD700', fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(0.5, 0);
    this.trickInfo = this.add.text(CW / 2, 420, '', {
      fontSize: '12px', color: '#99aa99', fontFamily: 'Arial'
    }).setOrigin(0.5);
    this.statusLine = this.add.text(CW / 2, 618, '', {
      fontSize: '13px', color: '#FFD700', fontStyle: 'bold', fontFamily: 'Arial',
      wordWrap: { width: CW - 30 }, align: 'center'
    }).setOrigin(0.5);
    this.msgOverlay = this.add.text(CW / 2, 270, '', {
      fontSize: '24px', color: '#FFD700', fontStyle: 'bold', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5).setDepth(200).setAlpha(0);
  }

  _rebuildLabels(n) {
    var k;
    for (k in this.playerLabels) {
      if (this.playerLabels[k]) this.playerLabels[k].destroy();
    }
    this.playerLabels = {};
    for (var i = 0; i < n; i++) {
      var pos = this.positions.names[i];
      var sz = (i === 0) ? '12px' : '10px';
      this.playerLabels[i] = this.add.text(pos.x, pos.y, '', {
        fontSize: sz, color: '#a8d8b8', fontFamily: 'Arial',
        wordWrap: { width: 100 }, align: 'center'
      }).setOrigin(0.5).setDepth(10);
    }
    this.prevPlayerCount = n;
  }

  updateGameState(state) {
    this.gameState = state;
    this._clearDynamic();

    var n = state.playerCount || state.players.length;
    this.positions = computePositions(n);

    if (n !== this.prevPlayerCount) {
      this._rebuildLabels(n);
    }

    this._updateScores(state);
    this._updateTrump(state);
    this._updateLabels(state);
    this._updateTrickInfo(state);
    this._renderOtherCards(state);
    this._renderTrick(state);
    this._renderHand(state);
    this._renderUI(state);
  }

  _updateScores(state) {
    if (state.gameMode === 'ffa') {
      var parts = [];
      for (var i = 0; i < state.players.length; i++) {
        var name = i === 0 ? 'You' : state.players[i].name;
        parts.push(name + ': ' + state.scores[i]);
      }
      this.scoreText.setText(parts.join('  |  '));
    } else {
      this.scoreText.setText('Us: ' + state.scores[0] + '    Them: ' + state.scores[1]);
    }
  }

  _updateTrump(state) {
    if (state.trumpSuit) {
      var sym = SUIT_SYM[state.trumpSuit];
      this.trumpDisplay.setText('Trump ' + sym).setColor(SUIT_CLR_LIGHT[state.trumpSuit]);
    } else {
      this.trumpDisplay.setText('');
    }
  }

  _updateLabels(state) {
    for (var i = 0; i < state.players.length; i++) {
      if (!this.playerLabels[i]) continue;
      var p = state.players[i];
      var txt = p.name;
      if (p.isDealer) txt += ' ★';
      if (this._isPartner(state, i)) txt += ' (partner)';
      if (state.secretPartnerRevealed && state.secretPartner === i && i !== 0) {
        txt += ' (secret ally)';
      }
      if (i === 0) txt = '▶ ' + txt;
      this.playerLabels[i].setText(txt);
    }
  }

  _isPartner(state, relIdx) {
    if (relIdx === 0) return false;
    if (state.gameMode === 'teams_2v2') return relIdx === 2;
    if (state.gameMode === 'teams_3v3') return relIdx === 2 || relIdx === 4;
    return false;
  }

  _updateTrickInfo(state) {
    if (state.state === 'playing' || state.state === 'trick_complete') {
      if (state.gameMode === 'ffa') {
        var parts = [];
        for (var i = 0; i < state.players.length; i++) {
          var nm = i === 0 ? 'You' : state.players[i].name;
          parts.push(nm + ': ' + state.tricksWon[i]);
        }
        this.trickInfo.setText('Tricks — ' + parts.join('  '));
      } else {
        this.trickInfo.setText('Tricks — Us: ' + state.tricksWon[0] + '  Them: ' + state.tricksWon[1]);
      }
    } else {
      this.trickInfo.setText('');
    }
  }

  _renderOtherCards(state) {
    var n = state.players.length;
    var backScale = n <= 4 ? 0.48 : (n <= 5 ? 0.42 : 0.36);
    for (var i = 1; i < n; i++) {
      var pos = this.positions.cards[i];
      var count = state.players[i].cardCount;
      if (count <= 0) continue;
      if (Math.abs(pos.x - CW / 2) < 80) {
        this._addCardRow(pos.x, pos.y, count, backScale, 18 * backScale + 6);
      } else {
        this._addCardCol(pos.x, pos.y, count, backScale, 14 * backScale + 4);
      }
    }
  }

  _addCardRow(cx, cy, count, scale, spacing) {
    var totalW = (count - 1) * spacing;
    var startX = cx - totalW / 2;
    for (var i = 0; i < count; i++) {
      var card = this._createCardBack(startX + i * spacing, cy, scale);
      this.dynamicObjects.push(card);
    }
  }

  _addCardCol(cx, cy, count, scale, spacing) {
    var totalH = (count - 1) * spacing;
    var startY = cy - totalH / 2;
    for (var i = 0; i < count; i++) {
      var card = this._createCardBack(cx, startY + i * spacing, scale);
      this.dynamicObjects.push(card);
    }
  }

  _renderTrick(state) {
    for (var i = 0; i < state.currentTrick.length; i++) {
      var entry = state.currentTrick[i];
      var pos = this.positions.tricks[entry.playerIndex];
      if (pos) {
        var card = this._createFaceCard(pos.x, pos.y, entry.card.suit, entry.card.value, 0.68);
        card.setDepth(20 + i);
        this.dynamicObjects.push(card);
      }
    }

    if ((state.state === 'bidding1' || state.state === 'bidding2') && state.turnedCard) {
      var tc = this._createFaceCard(340, 90, state.turnedCard.suit, state.turnedCard.value, 0.58);
      tc.setDepth(5);
      this.dynamicObjects.push(tc);
      var lbl = this.add.text(340, 123, 'turned up', {
        fontSize: '9px', color: '#889988', fontFamily: 'Arial'
      }).setOrigin(0.5);
      this.dynamicObjects.push(lbl);
    }
  }

  _renderHand(state) {
    var cards = state.hand;
    if (!cards || cards.length === 0) return;

    var spacing = Math.min(68, 350 / cards.length);
    var totalW = (cards.length - 1) * spacing;
    var startX = CW / 2 - totalW / 2;
    var y = 490;
    var isMyTurn = state.currentPlayer === 0 && state.state === 'playing';

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var x = startX + i * spacing;
      var cardObj = this._createFaceCard(x, y, card.suit, card.value, 0.9);
      cardObj.setDepth(30 + i);
      if (isMyTurn) this._makeCardInteractive(cardObj, card, y);
      this.dynamicObjects.push(cardObj);
    }
  }

  _makeCardInteractive(cardObj, card, baseY) {
    var w = CARD_W * 0.9, h = CARD_H * 0.9;
    cardObj.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    var scene = this;
    cardObj.on('pointerover', function () {
      scene.tweens.add({ targets: cardObj, y: baseY - 18, duration: 120, ease: 'Back.easeOut' });
    });
    cardObj.on('pointerout', function () {
      scene.tweens.add({ targets: cardObj, y: baseY, duration: 100 });
    });
    cardObj.on('pointerdown', function () {
      scene.tweens.add({
        targets: cardObj, y: baseY - 30, scaleX: 0.95, scaleY: 0.95,
        duration: 80, yoyo: true,
        onComplete: function () {
          window.euchreApp.socket.emit('play-card', { suit: card.suit, value: card.value });
        }
      });
    });
  }

  _renderUI(state) {
    var isMyTurn = state.currentPlayer === 0;
    var self = this;
    var hasPartners = state.gameMode !== 'duel' && state.gameMode !== 'ffa';

    if (state.state === 'bidding1') {
      if (isMyTurn) {
        this.statusLine.setText('Pick it up or pass?');
        this._addBtn(130, 645, 'Order Up', '#4CAF50', function () {
          window.euchreApp.socket.emit('bid', { action: 'order_up', alone: false });
        });
        this._addBtn(290, 645, 'Pass', '#666', function () {
          window.euchreApp.socket.emit('bid', { action: 'pass' });
        });
        if (hasPartners) {
          this._addBtn(CW / 2, 672, 'Go Alone!', '#e67e22', function () {
            window.euchreApp.socket.emit('bid', { action: 'order_up', alone: true });
          });
        }
      } else {
        this.statusLine.setText(this._whoName(state) + ' is deciding...');
      }

    } else if (state.state === 'bidding2') {
      if (isMyTurn) {
        var canPass = state.canPass;
        this.statusLine.setText(canPass ? 'Name trump or pass' : 'You must name trump!');
        var available = ['hearts', 'diamonds', 'clubs', 'spades'].filter(function (s) {
          return s !== state.turnedCard.suit;
        });
        var btnPositions = this._spreadX(available.length, 645);
        for (var i = 0; i < available.length; i++) {
          (function (suit, bx) {
            var sym = SUIT_SYM[suit];
            var clr = SUIT_CLR[suit] === '#e74c3c' ? '#c0392b' : '#2c3e80';
            self._addBtn(bx, 645, sym + ' ' + suit.charAt(0).toUpperCase() + suit.slice(1), clr, function () {
              window.euchreApp.socket.emit('bid', { action: 'call', suit: suit, alone: self.wantAlone });
            });
          })(available[i], btnPositions[i]);
        }
        if (hasPartners) {
          var aloneClr = this.wantAlone ? '#e67e22' : '#555';
          var aloneLabel = this.wantAlone ? '✔ Alone' : 'Go Alone?';
          this._addBtn(canPass ? 120 : CW / 2, 672, aloneLabel, aloneClr, function () {
            self.wantAlone = !self.wantAlone;
            self.updateGameState(self.gameState);
          });
        }
        if (canPass) {
          this._addBtn(hasPartners ? 300 : CW / 2, 672, 'Pass', '#666', function () {
            window.euchreApp.socket.emit('bid', { action: 'pass' });
          });
        }
      } else {
        this.statusLine.setText(this._whoName(state) + ' is deciding...');
      }

    } else if (state.state === 'picking_partner') {
      if (isMyTurn) {
        this._renderPartnerPicker(state);
      } else {
        this.statusLine.setText(this._whoName(state) + ' is choosing a partner...');
      }

    } else if (state.state === 'playing') {
      this.statusLine.setText(isMyTurn ? 'Your turn — tap a card' : this._whoName(state) + '\'s turn');

    } else if (state.state === 'trick_complete') {
      if (state.lastTrickResult) this._showMsg(state.lastTrickResult.winnerName + ' wins!');
      this.statusLine.setText('');

    } else if (state.state === 'hand_complete') {
      if (state.lastHandResult) this._showMsg(state.lastHandResult.description);
      this.statusLine.setText('Next hand starting...');

    } else if (state.state === 'game_over') {
      var won = state.scores[0] >= 10;
      if (state.gameMode === 'ffa') {
        var myScore = state.scores[0];
        won = state.scores.every(function (s) { return myScore >= s; });
      }
      this._showMsg(won ? 'You Win!' : 'Game Over!');
      this.statusLine.setText(this._finalScoreText(state));
      this._addBtn(CW / 2, 655, 'Play Again', '#4CAF50', function () {
        window.euchreApp.socket.emit('new-game');
      });
    }
  }

  _renderPartnerPicker(state) {
    this.statusLine.setText('Name a card to pick your secret partner');
    var self = this;
    var suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    var values = state.hand.length > 0 ? null : ['9', '10', 'J', 'Q', 'K', 'A'];

    var allCards = [];
    var myHand = state.hand;
    for (var si = 0; si < suits.length; si++) {
      var deckValues = this._getDeckValues(state.playerCount);
      for (var vi = 0; vi < deckValues.length; vi++) {
        var s = suits[si], v = deckValues[vi];
        var inHand = myHand.some(function (c) { return c.suit === s && c.value === v; });
        if (!inHand) allCards.push({ suit: s, value: v });
      }
    }

    var cols = Math.min(allCards.length, 6);
    var rows = Math.ceil(allCards.length / cols);
    var startY = 440;
    var spacingX = 56, spacingY = 36;
    var totalW = (cols - 1) * spacingX;
    var baseX = CW / 2 - totalW / 2;

    for (var ci = 0; ci < allCards.length; ci++) {
      var col = ci % cols, row = Math.floor(ci / cols);
      var bx = baseX + col * spacingX;
      var by = startY + row * spacingY;
      (function (card) {
        var sym = SUIT_SYM[card.suit];
        var clr = SUIT_CLR[card.suit] === '#e74c3c' ? '#8b1a1a' : '#1a2a4a';
        self._addBtn(bx, by, card.value + sym, clr, function () {
          window.euchreApp.socket.emit('pick-partner', { suit: card.suit, value: card.value });
        });
      })(allCards[ci]);
    }
  }

  _getDeckValues(n) {
    var configs = {
      2: ['9','10','J','Q','K','A'],
      3: ['9','10','J','Q','K','A'],
      4: ['9','10','J','Q','K','A'],
      5: ['8','9','10','J','Q','K','A'],
      6: ['7','8','9','10','J','Q','K','A'],
      7: ['6','7','8','9','10','J','Q','K','A']
    };
    return configs[n] || configs[4];
  }

  _whoName(state) {
    var cp = state.currentPlayer;
    return (state.players[cp] ? state.players[cp].name : '?');
  }

  _finalScoreText(state) {
    if (state.gameMode === 'ffa') {
      var parts = [];
      for (var i = 0; i < state.players.length; i++) {
        parts.push((i === 0 ? 'You' : state.players[i].name) + ': ' + state.scores[i]);
      }
      return parts.join('  |  ');
    }
    return 'Final: Us ' + state.scores[0] + ' - Them ' + state.scores[1];
  }

  _spreadX(count, y) {
    var spacing = Math.min(120, (CW - 60) / count);
    var totalW = (count - 1) * spacing;
    var start = CW / 2 - totalW / 2;
    var result = [];
    for (var i = 0; i < count; i++) result.push(start + i * spacing);
    return result;
  }

  _addBtn(x, y, text, color, callback) {
    var container = this.add.container(x, y);
    var tmp = this.add.text(0, 0, text, { fontSize: '12px', fontStyle: 'bold', fontFamily: 'Arial' });
    var tw = tmp.width, th = tmp.height;
    tmp.destroy();
    var padX = 12, padY = 7;
    var bw = tw + padX * 2, bh = th + padY * 2;
    var bg = this.add.graphics();
    var colorInt = Phaser.Display.Color.HexStringToColor(color).color;
    bg.fillStyle(colorInt, 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 7);
    bg.lineStyle(1, 0xffffff, 0.12);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 7);
    container.add(bg);
    var label = this.add.text(0, 0, text, {
      fontSize: '12px', color: '#fff', fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(0.5);
    container.add(label);
    container.setSize(bw, bh);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-bw / 2, -bh / 2, bw, bh),
      Phaser.Geom.Rectangle.Contains
    );
    container.on('pointerdown', callback);
    container.setDepth(100);
    this.dynamicObjects.push(container);
    return container;
  }

  _createFaceCard(x, y, suit, value, scale) {
    scale = scale || 1;
    var container = this.add.container(x, y);
    var w = CARD_W * scale, h = CARD_H * scale;
    var bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25);
    bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w, h, 5 * scale);
    bg.fillStyle(0xfefefe, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 5 * scale);
    bg.lineStyle(1.2, 0xbbbbbb, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 5 * scale);
    container.add(bg);
    var color = SUIT_CLR[suit], sym = SUIT_SYM[suit];
    var vs = Math.max(9, Math.round(13 * scale));
    var ss = Math.max(7, Math.round(11 * scale));
    var bs = Math.max(12, Math.round(26 * scale));
    container.add(this.add.text(-w / 2 + 5 * scale, -h / 2 + 4 * scale, value, {
      fontSize: vs + 'px', color: color, fontStyle: 'bold', fontFamily: 'Arial'
    }));
    container.add(this.add.text(-w / 2 + 5 * scale, -h / 2 + 18 * scale, sym, {
      fontSize: ss + 'px', color: color, fontFamily: 'Arial'
    }));
    container.add(this.add.text(0, -3 * scale, sym, {
      fontSize: bs + 'px', color: color, fontFamily: 'Arial'
    }).setOrigin(0.5));
    container.add(this.add.text(w / 2 - 5 * scale, h / 2 - 4 * scale, value, {
      fontSize: vs + 'px', color: color, fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(1, 1).setAngle(180));
    container.add(this.add.text(w / 2 - 5 * scale, h / 2 - 18 * scale, sym, {
      fontSize: ss + 'px', color: color, fontFamily: 'Arial'
    }).setOrigin(1, 1).setAngle(180));
    container.setSize(w, h);
    return container;
  }

  _createCardBack(x, y, scale) {
    scale = scale || 1;
    var container = this.add.container(x, y);
    var w = CARD_W * scale, h = CARD_H * scale;
    var bg = this.add.graphics();
    bg.fillStyle(0x1a4d7a, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4 * scale);
    bg.lineStyle(1, 0x0f3555, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 4 * scale);
    bg.lineStyle(1.5, 0x3498db, 0.4);
    bg.strokeRoundedRect(-w / 2 + 3 * scale, -h / 2 + 3 * scale, w - 6 * scale, h - 6 * scale, 3 * scale);
    bg.fillStyle(0x2980b9, 0.2);
    var step = Math.max(4, 7 * scale);
    for (var dy = -h / 2 + 6 * scale; dy < h / 2 - 6 * scale; dy += step) {
      for (var dx = -w / 2 + 6 * scale; dx < w / 2 - 6 * scale; dx += step) {
        bg.fillRect(dx + 1, dy + 1, step * 0.5, step * 0.5);
      }
    }
    container.add(bg);
    container.setSize(w, h);
    return container;
  }

  _showMsg(text) {
    this.msgOverlay.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.msgOverlay);
    this.tweens.add({
      targets: this.msgOverlay, alpha: 0,
      duration: 600, delay: 1800, ease: 'Power2'
    });
  }

  showMessage(text) { this._showMsg(text); }

  _clearDynamic() {
    for (var i = 0; i < this.dynamicObjects.length; i++) {
      if (this.dynamicObjects[i] && this.dynamicObjects[i].destroy) {
        this.dynamicObjects[i].destroy();
      }
    }
    this.dynamicObjects = [];
  }
}
