const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_RANK = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7, '10': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12 };
const PASS_DIRECTIONS = ['left', 'right', 'across', 'none'];

const HEARTS_STATES = {
  WAITING: 'waiting',
  PASSING: 'passing',
  PLAYING: 'playing',
  TRICK_COMPLETE: 'trick_complete',
  HAND_COMPLETE: 'hand_complete',
  GAME_OVER: 'game_over'
};

class HeartsGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.gameType = 'hearts';
    this.players = [];
    this.state = HEARTS_STATES.WAITING;
    this.playerCount = 0;
    this.creatorId = null;

    this.handNumber = 0;
    this.scores = [0, 0, 0, 0];
    this.handScores = [0, 0, 0, 0];
    this.currentPlayer = null;
    this.currentTrick = [];
    this.trickNumber = 0;
    this.heartsBroken = false;
    this.passDirection = null;
    this.pendingPasses = new Map();
    this.lastTrickResult = null;
    this.lastHandResult = null;
  }

  addPlayer(id, name) {
    if (this.players.length >= 4) return { error: 'Room is full (max 4 for Hearts)' };
    if (this.state !== HEARTS_STATES.WAITING) return { error: 'Game already started' };
    const existing = this.players.find(p => p.id === id);
    if (existing) {
      return { error: 'Already in room', playerIndex: this.players.indexOf(existing) };
    }
    const playerIndex = this.players.length;
    this.players.push({ id, name, hand: [], team: playerIndex });
    if (playerIndex === 0) this.creatorId = id;
    return { success: true, playerIndex };
  }

  removePlayer(id) {
    if (this.state !== HEARTS_STATES.WAITING) return { error: 'Cannot leave during game' };
    const idx = this.players.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      if (this.players.length > 0 && this.creatorId === id) {
        this.creatorId = this.players[0].id;
      }
    }
    return { success: true };
  }

  startGame() {
    if (this.players.length !== 4) return { error: 'Hearts requires exactly 4 players' };
    this.playerCount = 4;
    this.scores = [0, 0, 0, 0];
    this.handNumber = 0;
    this._dealHand();
    return { success: true };
  }

  _buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value });
      }
    }
    return deck;
  }

  _shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  _sortHand(hand) {
    const suitOrder = { clubs: 0, diamonds: 1, spades: 2, hearts: 3 };
    hand.sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return VALUE_RANK[a.value] - VALUE_RANK[b.value];
    });
  }

  _dealHand() {
    const deck = this._shuffle(this._buildDeck());

    for (let i = 0; i < 4; i++) {
      this.players[i].hand = deck.splice(0, 13);
      this._sortHand(this.players[i].hand);
    }

    this.currentTrick = [];
    this.trickNumber = 0;
    this.heartsBroken = false;
    this.handScores = [0, 0, 0, 0];
    this.lastTrickResult = null;
    this.lastHandResult = null;
    this.pendingPasses = new Map();

    this.passDirection = PASS_DIRECTIONS[this.handNumber % 4];

    if (this.passDirection === 'none') {
      this._startPlay();
    } else {
      this.state = HEARTS_STATES.PASSING;
    }
  }

  _getPassTarget(fromIndex) {
    if (this.passDirection === 'left') return (fromIndex + 1) % 4;
    if (this.passDirection === 'right') return (fromIndex + 3) % 4;
    if (this.passDirection === 'across') return (fromIndex + 2) % 4;
    return fromIndex;
  }

  submitPass(playerId, cards) {
    if (this.state !== HEARTS_STATES.PASSING) return { error: 'Not in passing state' };

    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Player not found' };
    if (this.pendingPasses.has(playerIndex)) return { error: 'Already submitted pass' };
    if (!cards || cards.length !== 3) return { error: 'Must pass exactly 3 cards' };

    const hand = this.players[playerIndex].hand;
    for (const card of cards) {
      if (!hand.some(c => c.suit === card.suit && c.value === card.value)) {
        return { error: 'Card not in your hand' };
      }
    }

    this.pendingPasses.set(playerIndex, cards);

    if (this.pendingPasses.size === 4) {
      this._executePasses();
    }

    return { success: true };
  }

  _executePasses() {
    const received = [[], [], [], []];

    for (const [fromIndex, cards] of this.pendingPasses) {
      const toIndex = this._getPassTarget(fromIndex);
      const hand = this.players[fromIndex].hand;

      for (const card of cards) {
        const idx = hand.findIndex(c => c.suit === card.suit && c.value === card.value);
        if (idx !== -1) {
          received[toIndex].push(hand.splice(idx, 1)[0]);
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      this.players[i].hand.push(...received[i]);
      this._sortHand(this.players[i].hand);
    }

    this.pendingPasses = new Map();
    this._startPlay();
  }

  _startPlay() {
    this._findTwoOfClubsLead();
    this.state = HEARTS_STATES.PLAYING;
    this.currentTrick = [];
  }

  _findTwoOfClubsLead() {
    for (let i = 0; i < 4; i++) {
      if (this.players[i].hand.some(c => c.suit === 'clubs' && c.value === '2')) {
        this.currentPlayer = i;
        return;
      }
    }
    this.currentPlayer = 0;
  }

  playCard(playerId, suit, value) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Player not found' };
    if (playerIndex !== this.currentPlayer) return { error: 'Not your turn' };
    if (this.state !== HEARTS_STATES.PLAYING) return { error: 'Not in playing state' };

    const hand = this.players[playerIndex].hand;
    const cardIdx = hand.findIndex(c => c.suit === suit && c.value === value);
    if (cardIdx === -1) return { error: 'Card not in hand' };

    const card = hand[cardIdx];

    if (this.trickNumber === 0 && this.currentTrick.length === 0) {
      if (card.suit !== 'clubs' || card.value !== '2') {
        return { error: 'Must lead the 2 of clubs' };
      }
    }

    if (this.currentTrick.length > 0) {
      const leadSuit = this.currentTrick[0].card.suit;
      if (card.suit !== leadSuit && hand.some(c => c.suit === leadSuit)) {
        return { error: 'Must follow suit' };
      }
    }

    if (this.trickNumber === 0 && this.currentTrick.length > 0) {
      const isPointCard = card.suit === 'hearts' || (card.suit === 'spades' && card.value === 'Q');
      if (isPointCard) {
        const leadSuit = this.currentTrick[0].card.suit;
        const hasNonPoint = hand.some(c => {
          if (c.suit === card.suit && c.value === card.value) return false;
          if (c.suit === 'hearts') return false;
          if (c.suit === 'spades' && c.value === 'Q') return false;
          return true;
        });
        const canFollowLead = hand.some(c => c.suit === leadSuit);
        if (hasNonPoint && !canFollowLead) {
          return { error: 'Cannot play point cards on the first trick' };
        }
      }
    }

    if (this.currentTrick.length === 0 && card.suit === 'hearts' && !this.heartsBroken) {
      const hasNonHearts = hand.some(c => c.suit !== 'hearts');
      if (hasNonHearts) {
        return { error: 'Hearts not broken yet' };
      }
    }

    hand.splice(cardIdx, 1);
    this.currentTrick.push({ playerIndex, card });

    if (card.suit === 'hearts') this.heartsBroken = true;

    if (this.currentTrick.length >= 4) {
      return this._resolveTrick();
    }

    this.currentPlayer = (this.currentPlayer + 1) % 4;
    return { success: true };
  }

  _resolveTrick() {
    const leadSuit = this.currentTrick[0].card.suit;
    let winner = this.currentTrick[0];
    let bestRank = VALUE_RANK[winner.card.value];

    for (let i = 1; i < this.currentTrick.length; i++) {
      const entry = this.currentTrick[i];
      if (entry.card.suit === leadSuit) {
        const rank = VALUE_RANK[entry.card.value];
        if (rank > bestRank) {
          bestRank = rank;
          winner = entry;
        }
      }
    }

    let trickPoints = 0;
    for (const entry of this.currentTrick) {
      if (entry.card.suit === 'hearts') trickPoints += 1;
      if (entry.card.suit === 'spades' && entry.card.value === 'Q') trickPoints += 13;
    }
    this.handScores[winner.playerIndex] += trickPoints;

    this.lastTrickResult = {
      winner: winner.playerIndex,
      winnerName: this.players[winner.playerIndex].name,
      cards: [...this.currentTrick]
    };

    this.trickNumber++;

    if (this.trickNumber >= 13) {
      return this._resolveHand();
    }

    this.currentPlayer = winner.playerIndex;
    this.currentTrick = [];
    this.state = HEARTS_STATES.TRICK_COMPLETE;
    return { success: true, trickComplete: true };
  }

  _resolveHand() {
    const moonShooter = this.handScores.findIndex(s => s === 26);

    if (moonShooter !== -1) {
      for (let i = 0; i < 4; i++) {
        if (i === moonShooter) {
          this.scores[i] += 0;
        } else {
          this.scores[i] += 26;
        }
      }
      this.lastHandResult = {
        description: this.players[moonShooter].name + ' shot the moon!',
        handScores: [...this.handScores],
        moonShooter
      };
    } else {
      for (let i = 0; i < 4; i++) {
        this.scores[i] += this.handScores[i];
      }
      this.lastHandResult = {
        description: 'Hand complete',
        handScores: [...this.handScores],
        moonShooter: -1
      };
    }

    if (this.scores.some(s => s >= 100)) {
      this.state = HEARTS_STATES.GAME_OVER;
      return { success: true, handComplete: true, gameOver: true };
    }

    this.state = HEARTS_STATES.HAND_COMPLETE;
    return { success: true, handComplete: true };
  }

  continuePlaying() {
    if (this.state === HEARTS_STATES.TRICK_COMPLETE) {
      this.state = HEARTS_STATES.PLAYING;
      return { success: true };
    }
    if (this.state === HEARTS_STATES.HAND_COMPLETE) {
      this.handNumber++;
      this._dealHand();
      return { success: true };
    }
    return { error: 'Cannot continue from this state' };
  }

  getStateForPlayer(playerId) {
    const pi = this.players.findIndex(p => p.id === playerId);
    if (pi === -1) return null;

    const N = 4;
    const rel = (i) => (i !== null && i !== undefined) ? (i - pi + N) % N : null;

    const scoresView = [];
    const handScoresView = [];
    for (let offset = 0; offset < N; offset++) {
      const abs = (pi + offset) % N;
      scoresView.push(this.scores[abs]);
      handScoresView.push(this.handScores[abs]);
    }

    return {
      state: this.state,
      gameType: 'hearts',
      playerCount: N,
      gameMode: 'ffa',
      hand: this.players[pi].hand.map(c => ({ ...c })),
      currentPlayer: rel(this.currentPlayer),
      players: Array.from({ length: N }, (_, offset) => {
        const abs = (pi + offset) % N;
        return {
          name: this.players[abs].name,
          cardCount: this.players[abs].hand.length,
          team: abs
        };
      }),
      currentTrick: this.currentTrick.map(t => ({
        playerIndex: rel(t.playerIndex),
        card: { ...t.card }
      })),
      scores: scoresView,
      handScores: handScoresView,
      heartsBroken: this.heartsBroken,
      passDirection: this.passDirection,
      hasSubmittedPass: this.pendingPasses.has(pi),
      trickNumber: this.trickNumber,
      handNumber: this.handNumber,
      tricksWon: scoresView,
      lastTrickResult: this.lastTrickResult ? {
        winner: rel(this.lastTrickResult.winner),
        winnerName: this.lastTrickResult.winnerName,
        cards: this.lastTrickResult.cards.map(t => ({
          playerIndex: rel(t.playerIndex),
          card: { ...t.card }
        }))
      } : null,
      lastHandResult: this.lastHandResult
    };
  }
}

module.exports = { HeartsGame, HEARTS_STATES };
