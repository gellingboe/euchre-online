var CARD_W = 60;
var CARD_H = 86;
var SUIT_SYM = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
var SUIT_CLR = { hearts: '#e74c3c', diamonds: '#e74c3c', clubs: '#222', spades: '#222' };
var SUIT_CLR_LIGHT = { hearts: '#ff6b6b', diamonds: '#ff6b6b', clubs: '#88aacc', spades: '#88aacc' };
var HCW = 420, HCH = 720;

function heartsComputePositions(n) {
  var cx = HCW / 2, cy = 255;
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

class HeartsGameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeartsGameScene' });
  }

  create() {
    window.heartsGameScene = this;
    this.dynamicObjects = [];
    this.playerLabels = {};
    this.prevPlayerCount = 0;
    this.positions = null;
    this.selectedCards = [];

    this._drawBackground();
    this._createStaticUI();

    if (window.heartsPendingState) {
      this.updateGameState(window.heartsPendingState);
      window.heartsPendingState = null;
    }
  }

  _drawBackground() {
    var bg = this.add.graphics();
    bg.fillGradientStyle(0x2a1a1a, 0x2a1a1a, 0x1a0e0e, 0x1a0e0e);
    bg.fillRect(0, 0, HCW, HCH);
    bg.fillStyle(0x3a2020, 0.25);
    bg.fillRoundedRect(18, 100, HCW - 36, 280, 30);
    bg.lineStyle(2, 0x5a3030, 0.35);
    bg.strokeRoundedRect(18, 100, HCW - 36, 280, 30);
  }

  _createStaticUI() {
    this.scoreText = this.add.text(HCW / 2, 12, '', {
      fontSize: '13px', color: '#fff', fontStyle: 'bold', fontFamily: 'Arial',
      wordWrap: { width: HCW - 20 }, align: 'center'
    }).setOrigin(0.5, 0);
    this.heartsIndicator = this.add.text(HCW / 2, 30, '', {
      fontSize: '14px', color: '#888', fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(0.5, 0);
    this.handScoreText = this.add.text(HCW / 2, 420, '', {
      fontSize: '11px', color: '#aa8888', fontFamily: 'Arial',
      wordWrap: { width: HCW - 30 }, align: 'center'
    }).setOrigin(0.5);
    this.statusLine = this.add.text(HCW / 2, 618, '', {
      fontSize: '13px', color: '#FFD700', fontStyle: 'bold', fontFamily: 'Arial',
      wordWrap: { width: HCW - 30 }, align: 'center'
    }).setOrigin(0.5);
    this.msgOverlay = this.add.text(HCW / 2, 270, '', {
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
        fontSize: sz, color: '#d8b8b8', fontFamily: 'Arial',
        wordWrap: { width: 100 }, align: 'center'
      }).setOrigin(0.5).setDepth(10);
    }
    this.prevPlayerCount = n;
  }

  updateGameState(state) {
    this.gameState = state;
    this._clearDynamic();

    var n = state.playerCount || state.players.length;
    this.positions = heartsComputePositions(n);

    if (n !== this.prevPlayerCount) {
      this._rebuildLabels(n);
    }

    this._updateScores(state);
    this._updateHeartsIndicator(state);
    this._updateLabels(state);
    this._updateHandScores(state);
    this._renderOtherCards(state);
    this._renderTrick(state);
    this._renderHand(state);
    this._renderUI(state);
  }

  _updateScores(state) {
    var parts = [];
    for (var i = 0; i < state.players.length; i++) {
      var name = i === 0 ? 'You' : state.players[i].name;
      parts.push(name + ': ' + state.scores[i]);
    }
    this.scoreText.setText(parts.join('  |  '));
  }

  _updateHeartsIndicator(state) {
    if (state.heartsBroken) {
      this.heartsIndicator.setText('♥ Hearts Broken').setColor('#e74c3c');
    } else {
      this.heartsIndicator.setText('♥ Hearts Unbroken').setColor('#666');
    }
  }

  _updateLabels(state) {
    for (var i = 0; i < state.players.length; i++) {
      if (!this.playerLabels[i]) continue;
      var txt = state.players[i].name;
      if (i === 0) txt = '▶ ' + txt;
      this.playerLabels[i].setText(txt);
    }
  }

  _updateHandScores(state) {
    if (state.state === 'playing' || state.state === 'trick_complete') {
      var parts = [];
      for (var i = 0; i < state.players.length; i++) {
        var nm = i === 0 ? 'You' : state.players[i].name;
        parts.push(nm + ': ' + state.handScores[i]);
      }
      this.handScoreText.setText('Hand pts — ' + parts.join('  '));
    } else {
      this.handScoreText.setText('');
    }
  }

  _renderOtherCards(state) {
    var n = state.players.length;
    var backScale = 0.48;
    for (var i = 1; i < n; i++) {
      var pos = this.positions.cards[i];
      var count = state.players[i].cardCount;
      if (count <= 0) continue;
      if (Math.abs(pos.x - HCW / 2) < 80) {
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
  }

  _renderHand(state) {
    var cards = state.hand;
    if (!cards || cards.length === 0) return;

    var spacing = Math.min(68, 350 / cards.length);
    var totalW = (cards.length - 1) * spacing;
    var startX = HCW / 2 - totalW / 2;
    var y = 490;
    var isMyTurn = state.currentPlayer === 0 && state.state === 'playing';
    var isPassing = state.state === 'passing' && !state.hasSubmittedPass;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var x = startX + i * spacing;
      var isSelected = this._isCardSelected(card);
      var cardY = isSelected ? y - 22 : y;
      var cardObj = this._createFaceCard(x, cardY, card.suit, card.value, 0.9);
      cardObj.setDepth(30 + i);

      if (isSelected) {
        var glow = this.add.graphics();
        var gw = CARD_W * 0.9, gh = CARD_H * 0.9;
        glow.lineStyle(2, 0xFFD700, 0.8);
        glow.strokeRoundedRect(x - gw / 2 - 2, cardY - gh / 2 - 2, gw + 4, gh + 4, 6);
        glow.setDepth(29 + i);
        this.dynamicObjects.push(glow);
      }

      if (isMyTurn) {
        this._makeCardInteractive(cardObj, card, y);
      } else if (isPassing) {
        this._makeCardSelectable(cardObj, card, y);
      }
      this.dynamicObjects.push(cardObj);
    }
  }

  _isCardSelected(card) {
    return this.selectedCards.some(function (c) {
      return c.suit === card.suit && c.value === card.value;
    });
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

  _makeCardSelectable(cardObj, card, baseY) {
    var w = CARD_W * 0.9, h = CARD_H * 0.9;
    cardObj.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    var scene = this;
    cardObj.on('pointerdown', function () {
      var idx = scene.selectedCards.findIndex(function (c) {
        return c.suit === card.suit && c.value === card.value;
      });
      if (idx !== -1) {
        scene.selectedCards.splice(idx, 1);
      } else if (scene.selectedCards.length < 3) {
        scene.selectedCards.push({ suit: card.suit, value: card.value });
      }
      scene.updateGameState(scene.gameState);
    });
  }

  _renderUI(state) {
    var isMyTurn = state.currentPlayer === 0;
    var self = this;

    if (state.state === 'passing') {
      if (!state.hasSubmittedPass) {
        var dirLabel = state.passDirection.toUpperCase();
        this.statusLine.setText('Pass 3 cards ' + dirLabel);
        if (this.selectedCards.length === 3) {
          this._addBtn(HCW / 2, 650, 'Confirm Pass', '#4CAF50', function () {
            window.euchreApp.socket.emit('submit-pass', { cards: self.selectedCards });
            self.selectedCards = [];
          });
        } else {
          this.statusLine.setText('Select 3 cards to pass ' + dirLabel + ' (' + this.selectedCards.length + '/3)');
        }
      } else {
        this.statusLine.setText('Waiting for others to pass...');
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
      var myScore = state.scores[0];
      var won = state.scores.every(function (s) { return myScore <= s; });
      this._showMsg(won ? 'You Win!' : 'Game Over!');
      this.statusLine.setText(this._finalScoreText(state));
      this._addBtn(HCW / 2, 655, 'Play Again', '#4CAF50', function () {
        window.euchreApp.socket.emit('new-game');
      });
    }
  }

  _whoName(state) {
    var cp = state.currentPlayer;
    return (state.players[cp] ? state.players[cp].name : '?');
  }

  _finalScoreText(state) {
    var parts = [];
    for (var i = 0; i < state.players.length; i++) {
      parts.push((i === 0 ? 'You' : state.players[i].name) + ': ' + state.scores[i]);
    }
    return parts.join('  |  ');
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
    bg.fillStyle(0x7a1a1a, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 4 * scale);
    bg.lineStyle(1, 0x550f0f, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 4 * scale);
    bg.lineStyle(1.5, 0xdb3434, 0.4);
    bg.strokeRoundedRect(-w / 2 + 3 * scale, -h / 2 + 3 * scale, w - 6 * scale, h - 6 * scale, 3 * scale);
    bg.fillStyle(0xb92929, 0.2);
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
