class VoiceChat {
  constructor(socket, localPlayerId) {
    this.socket = socket;
    this.localPlayerId = localPlayerId;
    this.localStream = null;
    this.peers = {};
    this.audioElements = {};
    this.isMuted = false;
    this.isInitialized = false;
    this._setupSignaling();
    this._setupMicButton();
  }

  _setupMicButton() {
    var self = this;
    var btn = document.getElementById('mic-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        self.toggleMute();
      });
    }
  }

  _setupSignaling() {
    var self = this;

    this.socket.on('webrtc-offer', function (data) {
      self._handleOffer(data.fromPlayerId, data.offer);
    });

    this.socket.on('webrtc-answer', function (data) {
      self._handleAnswer(data.fromPlayerId, data.answer);
    });

    this.socket.on('webrtc-ice-candidate', function (data) {
      self._handleIceCandidate(data.fromPlayerId, data.candidate);
    });
  }

  async init(otherPlayerIds) {
    if (this.isInitialized) return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.warn('Microphone access denied:', err.message);
      this._updateStatus('Mic access denied');
      return;
    }

    this.isInitialized = true;
    this._updateStatus('Voice connected');

    for (var i = 0; i < otherPlayerIds.length; i++) {
      var remoteId = otherPlayerIds[i];
      var isInitiator = this.localPlayerId < remoteId;
      this._createPeer(remoteId, isInitiator);
    }
  }

  _getRtcConfig() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  _createPeer(remotePlayerId, isInitiator) {
    var self = this;
    var pc = new RTCPeerConnection(this._getRtcConfig());
    this.peers[remotePlayerId] = pc;

    if (this.localStream) {
      this.localStream.getTracks().forEach(function (track) {
        pc.addTrack(track, self.localStream);
      });
    }

    pc.onicecandidate = function (event) {
      if (event.candidate) {
        self.socket.emit('webrtc-ice-candidate', {
          targetPlayerId: remotePlayerId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = function (event) {
      self._handleRemoteTrack(remotePlayerId, event);
    };

    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        self._removePeer(remotePlayerId);
      }
    };

    if (isInitiator) {
      pc.createOffer().then(function (offer) {
        return pc.setLocalDescription(offer);
      }).then(function () {
        self.socket.emit('webrtc-offer', {
          targetPlayerId: remotePlayerId,
          offer: pc.localDescription
        });
      }).catch(function (err) {
        console.warn('WebRTC offer error:', err);
      });
    }
  }

  _handleRemoteTrack(remotePlayerId, event) {
    if (this.audioElements[remotePlayerId]) return;

    var audio = document.createElement('audio');
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    this.audioElements[remotePlayerId] = audio;

    audio.play().catch(function () {
      document.addEventListener('click', function retry() {
        audio.play().catch(function () {});
        document.removeEventListener('click', retry);
      }, { once: true });
    });
  }

  async _handleOffer(fromPlayerId, offer) {
    if (!this.peers[fromPlayerId]) {
      this._createPeer(fromPlayerId, false);
    }
    var pc = this.peers[fromPlayerId];
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('webrtc-answer', {
        targetPlayerId: fromPlayerId,
        answer: pc.localDescription
      });
    } catch (err) {
      console.warn('WebRTC answer error:', err);
    }
  }

  async _handleAnswer(fromPlayerId, answer) {
    var pc = this.peers[fromPlayerId];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.warn('WebRTC set answer error:', err);
      }
    }
  }

  async _handleIceCandidate(fromPlayerId, candidate) {
    var pc = this.peers[fromPlayerId];
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('WebRTC ICE error:', err);
      }
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(function (track) {
        track.enabled = !this.isMuted;
      }.bind(this));
    }
    var btn = document.getElementById('mic-toggle');
    if (btn) {
      btn.classList.toggle('muted', this.isMuted);
      btn.textContent = this.isMuted ? '🔇' : '🎙';
    }
    this._updateStatus(this.isMuted ? 'Muted' : 'Voice on');
  }

  _removePeer(remotePlayerId) {
    if (this.peers[remotePlayerId]) {
      this.peers[remotePlayerId].close();
      delete this.peers[remotePlayerId];
    }
    if (this.audioElements[remotePlayerId]) {
      this.audioElements[remotePlayerId].srcObject = null;
      this.audioElements[remotePlayerId].remove();
      delete this.audioElements[remotePlayerId];
    }
  }

  _updateStatus(text) {
    var status = document.getElementById('voice-status');
    if (status) {
      status.textContent = text;
      status.style.opacity = '1';
      setTimeout(function () { status.style.opacity = '0.6'; }, 2000);
    }
  }

  destroy() {
    var self = this;
    Object.keys(this.peers).forEach(function (id) {
      self._removePeer(id);
    });
    if (this.localStream) {
      this.localStream.getTracks().forEach(function (t) { t.stop(); });
      this.localStream = null;
    }
    this.isInitialized = false;
  }
}
