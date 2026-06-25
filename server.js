const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { EuchreGame, STATES, getGameMode } = require('./game-engine');
const { HeartsGame, HEARTS_STATES } = require('./hearts-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function broadcastState(game) {
  for (const player of game.players) {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('game-state', game.getStateForPlayer(player.id));
      }
    }
  }
}

function broadcastLobby(game) {
  const playerList = game.players.map(p => ({ name: p.name, team: p.team }));
  const n = game.players.length;
  const isHearts = game.gameType === 'hearts';
  const mode = isHearts ? 'ffa' : (n >= 2 ? getGameMode(n) : null);
  const canStart = isHearts ? n === 4 : n >= 2;
  const maxPlayers = isHearts ? 4 : 7;
  for (const player of game.players) {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.emit('lobby-update', {
          roomCode: game.roomCode,
          players: playerList,
          canStart,
          playerCount: n,
          maxPlayers,
          gameMode: mode,
          gameType: game.gameType || 'euchre',
          creatorId: game.creatorId
        });
      }
    }
  }
}

io.on('connection', (socket) => {
  let currentPlayerId = null;
  let currentRoom = null;

  socket.on('create-room', ({ playerName, playerId, gameType }) => {
    if (!playerName || !playerId) return socket.emit('error', { message: 'Name required' });

    const roomCode = generateCode();
    const game = gameType === 'hearts' ? new HeartsGame(roomCode) : new EuchreGame(roomCode);
    if (!game.gameType) game.gameType = gameType || 'euchre';
    const result = game.addPlayer(playerId, playerName);
    if (result.error) return socket.emit('error', { message: result.error });

    game.players[game.players.length - 1].socketId = socket.id;
    rooms.set(roomCode, game);
    currentPlayerId = playerId;
    currentRoom = roomCode;
    socket.join(roomCode);

    socket.emit('room-created', { roomCode });
    broadcastLobby(game);
  });

  socket.on('join-room', ({ roomCode, playerName, playerId }) => {
    if (!playerName || !playerId || !roomCode) {
      return socket.emit('error', { message: 'Name and room code required' });
    }
    const code = roomCode.toUpperCase();
    const game = rooms.get(code);
    if (!game) return socket.emit('error', { message: 'Room not found' });

    const existing = game.players.find(p => p.id === playerId);
    if (existing) {
      existing.socketId = socket.id;
      existing.name = playerName;
      currentPlayerId = playerId;
      currentRoom = code;
      socket.join(code);
      socket.emit('room-joined', { roomCode: code });
      if (game.state !== 'waiting') {
        broadcastState(game);
      } else {
        broadcastLobby(game);
      }
      return;
    }

    const result = game.addPlayer(playerId, playerName);
    if (result.error) return socket.emit('error', { message: result.error });

    game.players[game.players.length - 1].socketId = socket.id;
    currentPlayerId = playerId;
    currentRoom = code;
    socket.join(code);

    socket.emit('room-joined', { roomCode: code });
    broadcastLobby(game);
  });

  socket.on('start-game', () => {
    if (!currentRoom) return;
    const game = rooms.get(currentRoom);
    if (!game) return;

    const result = game.startGame();
    if (result.error) return socket.emit('error', { message: result.error });
    broadcastState(game);

    const playerIds = game.players.map(p => p.id);
    for (const player of game.players) {
      if (player.socketId) {
        const s = io.sockets.sockets.get(player.socketId);
        if (s) s.emit('voice-ready', { playerIds });
      }
    }
  });

  socket.on('bid', ({ action, suit, alone }) => {
    if (!currentRoom || !currentPlayerId) return;
    const game = rooms.get(currentRoom);
    if (!game) return;

    const result = game.bid(currentPlayerId, action, suit, alone);
    if (result.error) return socket.emit('error', { message: result.error });
    broadcastState(game);
  });

  socket.on('pick-partner', ({ suit, value }) => {
    if (!currentRoom || !currentPlayerId) return;
    const game = rooms.get(currentRoom);
    if (!game) return;

    const result = game.pickPartner(currentPlayerId, suit, value);
    if (result.error) return socket.emit('error', { message: result.error });
    broadcastState(game);
  });

  socket.on('play-card', ({ suit, value }) => {
    if (!currentRoom || !currentPlayerId) return;
    const game = rooms.get(currentRoom);
    if (!game) return;

    const result = game.playCard(currentPlayerId, suit, value);
    if (result.error) return socket.emit('error', { message: result.error });

    broadcastState(game);

    if (result.trickComplete) {
      setTimeout(() => {
        if (game.state === 'trick_complete') {
          game.continuePlaying();
          broadcastState(game);
        }
      }, 2000);
    } else if (result.handComplete) {
      if (!result.gameOver) {
        setTimeout(() => {
          if (game.state === 'hand_complete') {
            game.continuePlaying();
            broadcastState(game);
          }
        }, 4000);
      }
    }
  });

  socket.on('submit-pass', ({ cards }) => {
    if (!currentRoom || !currentPlayerId) return;
    const game = rooms.get(currentRoom);
    if (!game || game.gameType !== 'hearts') return;

    const result = game.submitPass(currentPlayerId, cards);
    if (result.error) return socket.emit('error', { message: result.error });
    broadcastState(game);
  });

  socket.on('new-game', () => {
    if (!currentRoom) return;
    const game = rooms.get(currentRoom);
    if (!game || game.state !== 'game_over') return;

    game.state = 'waiting';
    game.startGame();
    broadcastState(game);
  });

  socket.on('webrtc-offer', ({ targetPlayerId, offer }) => {
    if (!currentRoom) return;
    const game = rooms.get(currentRoom);
    if (!game) return;
    const target = game.players.find(p => p.id === targetPlayerId);
    if (target && target.socketId) {
      const s = io.sockets.sockets.get(target.socketId);
      if (s) s.emit('webrtc-offer', { fromPlayerId: currentPlayerId, offer });
    }
  });

  socket.on('webrtc-answer', ({ targetPlayerId, answer }) => {
    if (!currentRoom) return;
    const game = rooms.get(currentRoom);
    if (!game) return;
    const target = game.players.find(p => p.id === targetPlayerId);
    if (target && target.socketId) {
      const s = io.sockets.sockets.get(target.socketId);
      if (s) s.emit('webrtc-answer', { fromPlayerId: currentPlayerId, answer });
    }
  });

  socket.on('webrtc-ice-candidate', ({ targetPlayerId, candidate }) => {
    if (!currentRoom) return;
    const game = rooms.get(currentRoom);
    if (!game) return;
    const target = game.players.find(p => p.id === targetPlayerId);
    if (target && target.socketId) {
      const s = io.sockets.sockets.get(target.socketId);
      if (s) s.emit('webrtc-ice-candidate', { fromPlayerId: currentPlayerId, candidate });
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentPlayerId) {
      const game = rooms.get(currentRoom);
      if (game) {
        const player = game.players.find(p => p.id === currentPlayerId);
        if (player) {
          player.socketId = null;
          for (const p of game.players) {
            if (p.socketId) {
              const s = io.sockets.sockets.get(p.socketId);
              if (s) s.emit('player-disconnected', { name: player.name });
            }
          }
        }
        if (game.state === 'waiting') {
          game.removePlayer(currentPlayerId);
          if (game.players.length === 0) {
            rooms.delete(currentRoom);
          } else {
            broadcastLobby(game);
          }
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Euchre server running on http://localhost:${PORT}`);
});
