const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const PARTNER_SUIT = {
  hearts: 'diamonds', diamonds: 'hearts',
  clubs: 'spades', spades: 'clubs'
};
const VALUE_RANK = { '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'J': 5, 'Q': 6, 'K': 7, 'A': 8 };

const DECK_CONFIG = {
  2: ['9', '10', 'J', 'Q', 'K', 'A'],
  3: ['9', '10', 'J', 'Q', 'K', 'A'],
  4: ['9', '10', 'J', 'Q', 'K', 'A'],
  5: ['8', '9', '10', 'J', 'Q', 'K', 'A'],
  6: ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  7: ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
};

const STATES = {
  WAITING: 'waiting',
  BIDDING_ROUND_1: 'bidding1',
  BIDDING_ROUND_2: 'bidding2',
  PICKING_PARTNER: 'picking_partner',
  PLAYING: 'playing',
  TRICK_COMPLETE: 'trick_complete',
  HAND_COMPLETE: 'hand_complete',
  GAME_OVER: 'game_over'
};

function getGameMode(n) {
  if (n === 2) return 'duel';
  if (n === 3) return 'ffa';
  if (n === 4) return 'teams_2v2';
  if (n === 5) return 'secret_partner';
  if (n === 6) return 'teams_3v3';
  if (n === 7) return 'secret_partner';
  return 'ffa';
}

class EuchreGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.state = STATES.WAITING;
    this.playerCount = 0;
    this.gameMode = null;
    this.dealer = 0;
    this.currentPlayer = null;
    this.trumpSuit = null;
    this.trumpCaller = null;
    this.goingAlone = false;
    this.alonePlayer = null;
    this.turnedCard = null;
    this.kitty = [];
    this.currentTrick = [];
    this.tricksWon = [];
    this.scores = [];
    this.lastTrickResult = null;
    this.lastHandResult = null;
    this.secretPartnerCard = null;
    this.secretPartner = null;
    this.secretPartnerRevealed = false;
    this.creatorId = null;
  }

  addPlayer(id, name) {
    if (this.players.length >= 7) return { error: 'Room is full (max 7)' };
    if (this.state !== STATES.WAITING) return { error: 'Game already started' };
    const existing = this.players.find(p => p.id === id);
    if (existing) {
      return { error: 'Already in room', playerIndex: this.players.indexOf(existing) };
    }
    const playerIndex = this.players.length;
    this.players.push({ id, name, hand: [], team: 0 });
    if (playerIndex === 0) this.creatorId = id;
    this._assignTeams();
    return { success: true, playerIndex };
  }

  removePlayer(id) {
    if (this.state !== STATES.WAITING) return { error: 'Cannot leave during game' };
    const idx = this.players.findIndex(p => p.id === id);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      if (this.players.length > 0) {
        if (this.creatorId === id) this.creatorId = this.players[0].id;
        this._assignTeams();
      }
    }
    return { success: true };
  }

  _assignTeams() {
    const n = this.players.length;
    const mode = getGameMode(n);
    for (let i = 0; i < n; i++) {
      if (mode === 'duel') this.players[i].team = i;
      else if (mode === 'ffa') this.players[i].team = i;
      else if (mode === 'teams_2v2') this.players[i].team = i % 2;
      else if (mode === 'teams_3v3') this.players[i].team = i % 2;
      else if (mode === 'secret_partner') this.players[i].team = i;
    }
  }

  startGame() {
    const n = this.players.length;
    if (n < 2 || n > 7) return { error: 'Need 2-7 players' };
    this.playerCount = n;
    this.gameMode = getGameMode(n);
    this._assignTeams();
    this._initScoring();
    this.dealer = 0;
    this._dealHand();
    return { success: true };
  }

  _initScoring() {
    if (this.gameMode === 'ffa') {
      this.scores = new Array(this.playerCount).fill(0);
    } else if (this.gameMode === 'duel') {
      this.scores = [0, 0];
    } else {
      this.scores = [0, 0];
    }
  }

  _initTricksWon() {
    if (this.gameMode === 'ffa') {
      this.tricksWon = new Array(this.playerCount).fill(0);
    } else if (this.gameMode === 'duel') {
      this.tricksWon = [0, 0];
    } else {
      this.tricksWon = [0, 0];
    }
  }

  _next(i) {
    return (i + 1) % this.playerCount;
  }

  _dealHand() {
    const values = DECK_CONFIG[this.playerCount];
    const deck = [];
    for (const suit of SUITS) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    for (let i = 0; i < this.playerCount; i++) {
      this.players[i].hand = deck.splice(0, 5);
    }
    this.turnedCard = deck[0];
    this.kitty = deck;

    this.currentTrick = [];
    this._initTricksWon();
    this.trumpSuit = null;
    this.trumpCaller = null;
    this.goingAlone = false;
    this.alonePlayer = null;
    this.lastTrickResult = null;
    this.lastHandResult = null;
    this.secretPartnerCard = null;
    this.secretPartner = null;
    this.secretPartnerRevealed = false;

    if (this.gameMode === 'secret_partner') {
      this._assignTeams();
    }

    this.currentPlayer = this._next(this.dealer);
    this.state = STATES.BIDDING_ROUND_1;
  }

  bid(playerId, action, suit, alone) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Player not found' };
    if (playerIndex !== this.currentPlayer) return { error: 'Not your turn' };

    if (this.state === STATES.BIDDING_ROUND_1) {
      return this._bidRound1(playerIndex, action, alone);
    }
    if (this.state === STATES.BIDDING_ROUND_2) {
      return this._bidRound2(playerIndex, action, suit, alone);
    }
    return { error: 'Not in bidding state' };
  }

  _bidRound1(playerIndex, action, alone) {
    if (action === 'pass') {
      this.currentPlayer = this._next(this.currentPlayer);
      if (this.currentPlayer === this._next(this.dealer)) {
        this.state = STATES.BIDDING_ROUND_2;
      }
      return { success: true };
    }

    if (action === 'order_up') {
      this.trumpSuit = this.turnedCard.suit;
      this.trumpCaller = playerIndex;
      if (alone) {
        this.goingAlone = true;
        this.alonePlayer = playerIndex;
      }
      const dealerHand = this.players[this.dealer].hand;
      dealerHand.push(this.turnedCard);
      this._autoDiscard(this.dealer);
      this._afterTrumpCalled();
      return { success: true };
    }

    return { error: 'Invalid action' };
  }

  _bidRound2(playerIndex, action, suit, alone) {
    if (action === 'pass') {
      if (playerIndex === this.dealer) {
        return { error: 'Dealer must call trump (stick the dealer)' };
      }
      this.currentPlayer = this._next(this.currentPlayer);
      return { success: true };
    }

    if (action === 'call') {
      if (!suit || !SUITS.includes(suit)) return { error: 'Invalid suit' };
      if (suit === this.turnedCard.suit) return { error: 'Cannot call the turned-up suit' };
      this.trumpSuit = suit;
      this.trumpCaller = playerIndex;
      if (alone) {
        this.goingAlone = true;
        this.alonePlayer = playerIndex;
      }
      this._afterTrumpCalled();
      return { success: true };
    }

    return { error: 'Invalid action' };
  }

  _afterTrumpCalled() {
    if (this.gameMode === 'secret_partner' && !this.goingAlone) {
      this.state = STATES.PICKING_PARTNER;
      this.currentPlayer = this.trumpCaller;
      return;
    }
    this._setupTeamsForPlay();
    this._startPlay();
  }

  _setupTeamsForPlay() {
    if (this.gameMode === 'secret_partner') {
      for (let i = 0; i < this.playerCount; i++) {
        this.players[i].team = (i === this.trumpCaller) ? 0 : 1;
      }
    }
  }

  pickPartner(playerId, suit, value) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex !== this.trumpCaller) return { error: 'Only the caller picks a partner' };
    if (this.state !== STATES.PICKING_PARTNER) return { error: 'Not in partner picking state' };

    this.secretPartnerCard = { suit, value };

    for (let i = 0; i < this.playerCount; i++) {
      this.players[i].team = (i === this.trumpCaller) ? 0 : 1;
    }

    const callerHand = this.players[playerIndex].hand;
    if (callerHand.some(c => c.suit === suit && c.value === value)) {
      this.secretPartner = playerIndex;
      this.secretPartnerRevealed = true;
    }

    this._startPlay();
    return { success: true };
  }

  _startPlay() {
    this.state = STATES.PLAYING;
    this.currentTrick = [];
    this.currentPlayer = this._next(this.dealer);
    this._skipSittingOut();
  }

  _getPartner(playerIndex) {
    if (this.gameMode === 'teams_2v2') return (playerIndex + 2) % 4;
    if (this.gameMode === 'teams_3v3') return (playerIndex + 2) % 6;
    if (this.gameMode === 'secret_partner' && this.secretPartnerRevealed) {
      return this.secretPartner;
    }
    return null;
  }

  _skipSittingOut() {
    if (!this.goingAlone) return;
    const partner = this._getPartner(this.alonePlayer);
    if (partner !== null && this.currentPlayer === partner) {
      this.currentPlayer = this._next(this.currentPlayer);
    }
  }

  _getExpectedTrickCards() {
    let count = this.playerCount;
    if (this.goingAlone) {
      const partner = this._getPartner(this.alonePlayer);
      if (partner !== null && partner !== this.alonePlayer) count--;
    }
    return count;
  }

  playCard(playerId, suit, value) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Player not found' };
    if (playerIndex !== this.currentPlayer) return { error: 'Not your turn' };
    if (this.state !== STATES.PLAYING) return { error: 'Not in playing state' };

    const hand = this.players[playerIndex].hand;
    const cardIdx = hand.findIndex(c => c.suit === suit && c.value === value);
    if (cardIdx === -1) return { error: 'Card not in hand' };

    const card = hand[cardIdx];

    if (this.currentTrick.length > 0) {
      const leadSuit = this._effectiveSuit(this.currentTrick[0].card);
      const cardSuit = this._effectiveSuit(card);
      if (cardSuit !== leadSuit && this._canFollow(hand, leadSuit)) {
        return { error: 'Must follow suit' };
      }
    }

    hand.splice(cardIdx, 1);
    this.currentTrick.push({ playerIndex, card });

    if (this.gameMode === 'secret_partner' && !this.secretPartnerRevealed && this.secretPartnerCard) {
      if (card.suit === this.secretPartnerCard.suit && card.value === this.secretPartnerCard.value) {
        this.secretPartner = playerIndex;
        this.secretPartnerRevealed = true;
        this.players[playerIndex].team = 0;
      }
    }

    if (this.currentTrick.length >= this._getExpectedTrickCards()) {
      return this._resolveTrick();
    }

    this.currentPlayer = this._next(this.currentPlayer);
    this._skipSittingOut();
    return { success: true };
  }

  _resolveTrick() {
    const leadSuit = this._effectiveSuit(this.currentTrick[0].card);
    let winner = this.currentTrick[0];
    let bestPower = this._cardPower(winner.card, leadSuit);

    for (let i = 1; i < this.currentTrick.length; i++) {
      const power = this._cardPower(this.currentTrick[i].card, leadSuit);
      if (power > bestPower) {
        bestPower = power;
        winner = this.currentTrick[i];
      }
    }

    const winnerTeam = this.players[winner.playerIndex].team;
    this.tricksWon[winnerTeam]++;

    this.lastTrickResult = {
      winner: winner.playerIndex,
      winnerName: this.players[winner.playerIndex].name,
      cards: [...this.currentTrick]
    };

    const totalTricks = this.tricksWon.reduce((a, b) => a + b, 0);
    if (totalTricks >= 5) {
      return this._resolveHand();
    }

    this.currentPlayer = winner.playerIndex;
    this.currentTrick = [];
    this.state = STATES.TRICK_COMPLETE;
    return { success: true, trickComplete: true };
  }

  _resolveHand() {
    if (this.gameMode === 'secret_partner' && !this.secretPartnerRevealed) {
      this.secretPartnerRevealed = true;
      this.secretPartner = this.trumpCaller;
    }

    const result = this._calculateScore();
    this.lastHandResult = result;

    const gameOver = this._checkGameOver();
    if (gameOver) {
      this.state = STATES.GAME_OVER;
      return { success: true, handComplete: true, gameOver: true };
    }

    this.state = STATES.HAND_COMPLETE;
    return { success: true, handComplete: true };
  }

  _calculateScore() {
    if (this.gameMode === 'ffa') {
      return this._scoreFFA();
    }
    if (this.gameMode === 'duel') {
      return this._scoreDuel();
    }
    return this._scoreTeam();
  }

  _scoreDuel() {
    const callerIdx = this.trumpCaller;
    const opponentIdx = 1 - callerIdx;
    const callerTricks = this.tricksWon[callerIdx];
    let points, scoringPlayer, description;

    if (callerTricks >= 3) {
      scoringPlayer = callerIdx;
      if (callerTricks === 5) {
        points = 2;
        description = 'March! +2';
      } else {
        points = 1;
        description = 'Made it +1';
      }
    } else {
      scoringPlayer = opponentIdx;
      points = 2;
      description = 'Euchred! +2';
    }

    this.scores[scoringPlayer] += points;
    return { scoringTeam: scoringPlayer, points, description };
  }

  _scoreFFA() {
    const callerIdx = this.trumpCaller;
    const callerTricks = this.tricksWon[callerIdx];
    let description;

    if (callerTricks >= 3) {
      const points = callerTricks === 5 ? 2 : 1;
      this.scores[callerIdx] += points;
      description = callerTricks === 5 ? 'March! +2' : 'Made it +1';
      return { scoringTeam: callerIdx, points, description };
    } else {
      for (let i = 0; i < this.playerCount; i++) {
        if (i !== callerIdx) this.scores[i] += 2;
      }
      description = 'Euchred! Others +2';
      return { scoringTeam: -1, points: 2, description };
    }
  }

  _scoreTeam() {
    const makingTeam = this.players[this.trumpCaller].team;
    const makerTricks = this.tricksWon[makingTeam];
    let points, scoringTeam, description;

    if (makerTricks >= 3) {
      scoringTeam = makingTeam;
      if (makerTricks === 5) {
        points = this.goingAlone ? 4 : 2;
        description = this.goingAlone ? 'Alone march! +4' : 'March! +2';
      } else {
        points = 1;
        description = 'Made it +1';
      }
    } else {
      scoringTeam = 1 - makingTeam;
      points = 2;
      description = 'Euchred! +2';
    }

    this.scores[scoringTeam] += points;
    return { scoringTeam, points, description };
  }

  _checkGameOver() {
    return this.scores.some(s => s >= 10);
  }

  continuePlaying() {
    if (this.state === STATES.TRICK_COMPLETE) {
      this.state = STATES.PLAYING;
      this._skipSittingOut();
      return { success: true };
    }
    if (this.state === STATES.HAND_COMPLETE) {
      this.dealer = this._next(this.dealer);
      this._dealHand();
      return { success: true };
    }
    return { error: 'Cannot continue from this state' };
  }

  _effectiveSuit(card) {
    if (card.value === 'J' && this.trumpSuit && card.suit === PARTNER_SUIT[this.trumpSuit]) {
      return this.trumpSuit;
    }
    return card.suit;
  }

  _cardPower(card, leadSuit) {
    if (card.value === 'J' && card.suit === this.trumpSuit) return 1000;
    if (card.value === 'J' && card.suit === PARTNER_SUIT[this.trumpSuit]) return 999;
    const eSuit = this._effectiveSuit(card);
    if (eSuit === this.trumpSuit) return 500 + VALUE_RANK[card.value];
    if (eSuit === leadSuit) return 100 + VALUE_RANK[card.value];
    return 0;
  }

  _canFollow(hand, leadSuit) {
    return hand.some(c => this._effectiveSuit(c) === leadSuit);
  }

  _autoDiscard(playerIndex) {
    const hand = this.players[playerIndex].hand;
    let worstIdx = 0;
    let worstPower = Infinity;
    for (let i = 0; i < hand.length; i++) {
      let power;
      if (hand[i].value === 'J' && hand[i].suit === this.trumpSuit) power = 1000;
      else if (hand[i].value === 'J' && hand[i].suit === PARTNER_SUIT[this.trumpSuit]) power = 999;
      else if (this._effectiveSuit(hand[i]) === this.trumpSuit) power = 500 + VALUE_RANK[hand[i].value];
      else power = VALUE_RANK[hand[i].value];
      if (power < worstPower) {
        worstPower = power;
        worstIdx = i;
      }
    }
    hand.splice(worstIdx, 1);
  }

  getStateForPlayer(playerId) {
    const pi = this.players.findIndex(p => p.id === playerId);
    if (pi === -1) return null;

    const N = this.playerCount;
    const rel = (i) => (i !== null && i !== undefined) ? (i - pi + N) % N : null;
    const myTeam = this.players[pi].team;

    let tricksWonView, scoresView;
    if (this.gameMode === 'ffa') {
      tricksWonView = [];
      scoresView = [];
      for (let offset = 0; offset < N; offset++) {
        const abs = (pi + offset) % N;
        tricksWonView.push(this.tricksWon[abs] || 0);
        scoresView.push(this.scores[abs] || 0);
      }
    } else if (this.gameMode === 'duel') {
      const other = 1 - pi;
      tricksWonView = [this.tricksWon[pi] || 0, this.tricksWon[other] || 0];
      scoresView = [this.scores[pi] || 0, this.scores[other] || 0];
    } else {
      tricksWonView = [this.tricksWon[myTeam] || 0, this.tricksWon[1 - myTeam] || 0];
      scoresView = [this.scores[myTeam] || 0, this.scores[1 - myTeam] || 0];
    }

    return {
      state: this.state,
      playerCount: N,
      gameMode: this.gameMode,
      hand: this.players[pi].hand.map(c => ({ ...c })),
      trumpSuit: this.trumpSuit,
      turnedCard: this.turnedCard ? { ...this.turnedCard } : null,
      currentPlayer: rel(this.currentPlayer),
      dealer: rel(this.dealer),
      players: Array.from({ length: N }, (_, offset) => {
        const abs = (pi + offset) % N;
        return {
          name: this.players[abs].name,
          id: this.players[abs].id,
          cardCount: this.players[abs].hand.length,
          team: this.players[abs].team,
          isDealer: abs === this.dealer
        };
      }),
      currentTrick: this.currentTrick.map(t => ({
        playerIndex: rel(t.playerIndex),
        card: { ...t.card }
      })),
      tricksWon: tricksWonView,
      scores: scoresView,
      trumpCaller: rel(this.trumpCaller),
      goingAlone: this.goingAlone,
      alonePlayer: rel(this.alonePlayer),
      lastTrickResult: this.lastTrickResult ? {
        winner: rel(this.lastTrickResult.winner),
        winnerName: this.lastTrickResult.winnerName,
        cards: this.lastTrickResult.cards.map(t => ({
          playerIndex: rel(t.playerIndex),
          card: { ...t.card }
        }))
      } : null,
      lastHandResult: this.lastHandResult,
      canPass: !(this.state === STATES.BIDDING_ROUND_2 && this.currentPlayer === this.dealer),
      secretPartnerCard: this.secretPartnerCard,
      secretPartnerRevealed: this.secretPartnerRevealed,
      secretPartner: this.secretPartnerRevealed ? rel(this.secretPartner) : null
    };
  }
}

module.exports = { EuchreGame, STATES, SUITS, DECK_CONFIG, getGameMode };
