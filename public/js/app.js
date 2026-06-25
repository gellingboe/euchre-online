(function () {
  var playerId = localStorage.getItem('euchrePlayerId');
  if (!playerId) {
    playerId = 'p_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('euchrePlayerId', playerId);
  }

  var socket = io();
  var phaserGame = null;
  var currentGameType = null;
  var selectedGameType = 'euchre';
  var voiceChat = null;

  var MODE_LABELS = {
    duel: '1v1 Duel',
    ffa: 'Free for All',
    teams_2v2: '2v2 Partners',
    secret_partner: 'Secret Partner',
    teams_3v3: '3v3 Partners'
  };

  var lobby = document.getElementById('lobby');
  var loginSection = document.getElementById('login-section');
  var roomSection = document.getElementById('room-section');
  var gameContainer = document.getElementById('game-container');
  var playerNameInput = document.getElementById('player-name');
  var roomCodeInput = document.getElementById('room-code-input');
  var createBtn = document.getElementById('create-btn');
  var joinBtn = document.getElementById('join-btn');
  var startBtn = document.getElementById('start-btn');
  var roomCodeText = document.getElementById('room-code-text');
  var playerList = document.getElementById('player-list');
  var waitingText = document.getElementById('waiting-text');

  var gamePicks = document.querySelectorAll('.game-pick');
  gamePicks.forEach(function (btn) {
    btn.addEventListener('click', function () {
      gamePicks.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedGameType = btn.getAttribute('data-game');
    });
  });

  createBtn.addEventListener('click', function () {
    var name = playerNameInput.value.trim();
    if (!name) { playerNameInput.focus(); return; }
    socket.emit('create-room', { playerName: name, playerId: playerId, gameType: selectedGameType });
  });

  joinBtn.addEventListener('click', function () {
    var name = playerNameInput.value.trim();
    var code = roomCodeInput.value.trim().toUpperCase();
    if (!name) { playerNameInput.focus(); return; }
    if (!code || code.length !== 4) { roomCodeInput.focus(); return; }
    socket.emit('join-room', { roomCode: code, playerName: name, playerId: playerId });
  });

  startBtn.addEventListener('click', function () {
    socket.emit('start-game');
  });

  playerNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') createBtn.click();
  });
  roomCodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') joinBtn.click();
  });

  socket.on('room-created', function (data) {
    loginSection.style.display = 'none';
    roomSection.style.display = 'block';
    roomCodeText.textContent = data.roomCode;
  });

  socket.on('room-joined', function (data) {
    loginSection.style.display = 'none';
    roomSection.style.display = 'block';
    roomCodeText.textContent = data.roomCode;
  });

  socket.on('lobby-update', function (data) {
    playerList.innerHTML = '';
    var gameType = data.gameType || 'euchre';
    var showTeams = data.gameMode === 'teams_2v2' || data.gameMode === 'teams_3v3';

    data.players.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'player-entry';
      var badge = '';
      if (showTeams) {
        badge = '<span class="team-badge team-' + p.team + '">Team ' + (p.team + 1) + '</span>';
      }
      div.innerHTML = '<span>' + escapeHtml(p.name) + '</span>' + badge;
      playerList.appendChild(div);
    });

    var isCreator = data.creatorId === playerId;
    var maxPlayers = data.maxPlayers || 7;
    var modeLabel = gameType === 'hearts' ? 'Hearts' : (MODE_LABELS[data.gameMode] || '');

    if (data.canStart && isCreator) {
      startBtn.style.display = 'block';
      waitingText.innerHTML = data.playerCount + ' players — <span class="mode-preview">' + modeLabel + '</span>';
      waitingText.style.display = 'block';
    } else if (data.canStart) {
      startBtn.style.display = 'none';
      waitingText.innerHTML = data.playerCount + ' players — <span class="mode-preview">' + modeLabel + '</span><br>Waiting for host to start...';
      waitingText.style.display = 'block';
    } else {
      startBtn.style.display = 'none';
      waitingText.textContent = 'Waiting for players... (' + data.playerCount + '/' + maxPlayers + ')';
      waitingText.style.display = 'block';
    }
  });

  socket.on('game-state', function (state) {
    var gameType = state.gameType || 'euchre';

    if (!phaserGame) {
      startPhaserGame(gameType);
    }

    if (gameType === 'hearts') {
      if (window.heartsGameScene) {
        window.heartsGameScene.updateGameState(state);
      } else {
        window.heartsPendingState = state;
      }
    } else {
      if (window.euchreGameScene) {
        window.euchreGameScene.updateGameState(state);
      } else {
        window.euchrePendingState = state;
      }
    }
  });

  socket.on('voice-ready', function (data) {
    if (!voiceChat) {
      voiceChat = new VoiceChat(socket, playerId);
    }
    var otherIds = data.playerIds.filter(function (id) { return id !== playerId; });
    voiceChat.init(otherIds);
    document.getElementById('voice-controls').style.display = 'flex';
  });

  socket.on('error', function (data) {
    alert(data.message);
  });

  socket.on('player-disconnected', function (data) {
    var scene = window.heartsGameScene || window.euchreGameScene;
    if (scene) {
      scene.showMessage(data.name + ' disconnected');
    }
  });

  function startPhaserGame(gameType) {
    currentGameType = gameType;
    lobby.style.display = 'none';
    gameContainer.style.display = 'flex';

    var SceneClass = gameType === 'hearts' ? HeartsGameScene : GameScene;
    var bgColor = gameType === 'hearts' ? '#2a1a1a' : '#1a5c2e';

    phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 420,
      height: 720,
      parent: 'game-container',
      backgroundColor: bgColor,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      scene: SceneClass
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.euchreApp = {
    socket: socket,
    playerId: playerId
  };
})();
