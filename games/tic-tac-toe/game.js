const cells = Array.from(document.querySelectorAll("[data-cell]"));
const statusText = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset-game");
const localModeButton = document.querySelector("#local-mode");
const onlineModeButton = document.querySelector("#online-mode");
const onlinePanel = document.querySelector("#online-panel");
const connectionStatus = document.querySelector("#connection-status");
const inviteLink = document.querySelector("#invite-link");
const copyInviteButton = document.querySelector("#copy-invite");
const newRoomButton = document.querySelector("#new-room");

const winningLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const signalingHttpOrigin = isLocalDevelopment
  ? "http://localhost:8787"
  : "https://multiplayer.catbox.party";
const signalingWebSocketOrigin = signalingHttpOrigin.replace(/^http/, "ws");
const fallbackIceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
const webRtcSupported = typeof window.RTCPeerConnection === "function";

let mode = "local";
let board = Array(9).fill("");
let currentPlayer = "X";
let gameFinished = false;
let winningLine = null;
let myPlayer = null;
let peerConnected = false;
let movePending = false;
let roomId = "";
let signalingSocket = null;
let peerConnection = null;
let dataChannel = null;
let pendingIceCandidates = [];
let iceServersPromise = Promise.resolve(fallbackIceServers);
let connectionGeneration = 0;
let transportMode = "pending";

function findWinningLine() {
  return winningLines.find(function (line) {
    const first = board[line[0]];
    return first && line.every(function (index) {
      return board[index] === first;
    });
  }) || null;
}

function getResultMessage() {
  if (winningLine) {
    const winner = board[winningLine[0]];
    if (mode === "online") {
      return winner === myPlayer ? "You win!" : "Your friend wins.";
    }
    return "Player " + winner + " wins!";
  }

  if (gameFinished) return "It's a draw.";
  return null;
}

function canPlayCell(index) {
  if (gameFinished || board[index]) return false;
  if (mode === "local") return true;
  return peerConnected && !movePending && currentPlayer === myPlayer;
}

function renderBoard() {
  cells.forEach(function (cell, index) {
    const value = board[index];
    cell.textContent = value;
    cell.disabled = !canPlayCell(index);
    cell.classList.toggle("cell-x", value === "X");
    cell.classList.toggle("cell-o", value === "O");
    cell.classList.toggle("cell-win", Boolean(winningLine && winningLine.includes(index)));
    cell.setAttribute("aria-label", cell.dataset.label + ", " + (value || "empty"));
  });

  const resultMessage = getResultMessage();
  if (resultMessage) {
    statusText.textContent = resultMessage;
  } else if (mode === "local") {
    statusText.textContent = "Player " + currentPlayer + "'s turn";
  } else if (!peerConnected) {
    statusText.textContent = "Waiting for your friend...";
  } else if (movePending) {
    statusText.textContent = "Move sent...";
  } else if (currentPlayer === myPlayer) {
    statusText.textContent = "Your turn (" + myPlayer + ")";
  } else {
    statusText.textContent = "Friend's turn (" + currentPlayer + ")";
  }
}

function getNextStartingPlayer() {
  if (!winningLine) return "X";
  return board[winningLine[0]];
}

function resetBoard(startingPlayer = "X") {
  board = Array(9).fill("");
  currentPlayer = startingPlayer;
  gameFinished = false;
  winningLine = null;
  movePending = false;
  renderBoard();
}

function applyMove(index, player) {
  if (!Number.isInteger(index) || index < 0 || index > 8) return false;
  if (gameFinished || board[index] || currentPlayer !== player) return false;

  board[index] = player;
  winningLine = findWinningLine();

  if (winningLine || board.every(Boolean)) {
    gameFinished = true;
  } else {
    currentPlayer = currentPlayer === "X" ? "O" : "X";
  }

  renderBoard();
  return true;
}

function setModeButtons() {
  const localIsActive = mode === "local";
  localModeButton.classList.toggle("is-active", localIsActive);
  localModeButton.setAttribute("aria-pressed", String(localIsActive));
  onlineModeButton.classList.toggle("is-active", !localIsActive);
  onlineModeButton.setAttribute("aria-pressed", String(!localIsActive));
  onlinePanel.hidden = localIsActive;
}

function updateRoomUrl(nextRoomId) {
  const url = new URL(window.location.href);
  if (nextRoomId) {
    url.searchParams.set("room", nextRoomId);
  } else {
    url.searchParams.delete("room");
  }
  window.history.replaceState({}, "", url);
}

function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const binary = Array.from(bytes, function (byte) {
    return String.fromCharCode(byte);
  }).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isValidRoomId(value) {
  return /^[A-Za-z0-9_-]{22}$/.test(value);
}

function closePeerConnection() {
  peerConnected = false;
  movePending = false;
  pendingIceCandidates = [];
  transportMode = "pending";

  if (dataChannel) {
    dataChannel.onopen = null;
    dataChannel.onclose = null;
    dataChannel.onmessage = null;
    dataChannel.close();
    dataChannel = null;
  }

  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.ondatachannel = null;
    peerConnection.close();
    peerConnection = null;
  }

  renderBoard();
}

function disconnectOnline() {
  connectionGeneration += 1;
  closePeerConnection();

  if (signalingSocket) {
    signalingSocket.onopen = null;
    signalingSocket.onmessage = null;
    signalingSocket.onerror = null;
    signalingSocket.onclose = null;
    signalingSocket.close();
    signalingSocket = null;
  }

  myPlayer = null;
  roomId = "";
}

function switchToLocal() {
  disconnectOnline();
  mode = "local";
  updateRoomUrl("");
  setModeButtons();
  resetBoard();
  cells[0].focus();
}

async function loadIceServers() {
  try {
    const response = await fetch(signalingHttpOrigin + "/ice-servers", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("ICE server request failed");
    const result = await response.json();
    return Array.isArray(result.iceServers) && result.iceServers.length
      ? result.iceServers
      : fallbackIceServers;
  } catch (error) {
    return fallbackIceServers;
  }
}

function sendSignal(type, payload) {
  if (!signalingSocket || signalingSocket.readyState !== WebSocket.OPEN) return;
  signalingSocket.send(JSON.stringify({ type: type, payload: payload }));
}

function serializeSessionDescription(description) {
  return {
    type: description.type,
    sdp: description.sdp,
  };
}

function sendGameMessage(message) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(message));
    return true;
  }

  if (transportMode === "relay") {
    sendSignal("game-message", message);
    return true;
  }

  return false;
}

function currentStateMessage() {
  return {
    type: "state",
    board: board,
    currentPlayer: currentPlayer,
    gameFinished: gameFinished,
    winningLine: winningLine,
  };
}

function sendState() {
  if (myPlayer === "X") sendGameMessage(currentStateMessage());
}

function isValidState(message) {
  const validBoard = Array.isArray(message.board)
    && message.board.length === 9
    && message.board.every(function (value) {
      return value === "" || value === "X" || value === "O";
    });
  const validWinningLine = message.winningLine === null
    || (Array.isArray(message.winningLine)
      && message.winningLine.length === 3
      && message.winningLine.every(function (index) {
        return Number.isInteger(index) && index >= 0 && index <= 8;
      }));

  return message.type === "state"
    && validBoard
    && (message.currentPlayer === "X" || message.currentPlayer === "O")
    && typeof message.gameFinished === "boolean"
    && validWinningLine;
}

function handleGameMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    return;
  }

  if (myPlayer === "X") {
    if (message.type === "move" && applyMove(message.index, "O")) {
      sendState();
    } else if (message.type === "reset") {
      resetBoard(getNextStartingPlayer());
      sendState();
    }
    return;
  }

  if (myPlayer === "O" && isValidState(message)) {
    board = message.board.slice();
    currentPlayer = message.currentPlayer;
    gameFinished = message.gameFinished;
    winningLine = message.winningLine ? message.winningLine.slice() : null;
    movePending = false;
    renderBoard();
  }
}

function configureDataChannel(channel, generation) {
  dataChannel = channel;

  channel.onopen = function () {
    if (generation !== connectionGeneration) return;
    peerConnected = true;
    movePending = false;
    connectionStatus.textContent = "Connected — you are " + myPlayer + ".";
    renderBoard();
    if (myPlayer === "X") sendState();
  };

  channel.onmessage = handleGameMessage;

  channel.onclose = function () {
    if (generation !== connectionGeneration) return;
    peerConnected = false;
    movePending = false;
    connectionStatus.textContent = "Your friend disconnected.";
    renderBoard();
  };
}

function useCloudflareRelay() {
  if (transportMode === "relay" && peerConnected) return;
  closePeerConnection();
  transportMode = "relay";
  peerConnected = true;
  movePending = false;
  connectionStatus.textContent = "Connected — you are " + myPlayer + ".";
  renderBoard();
  if (myPlayer === "X") sendState();
}

function requestCloudflareRelay() {
  sendSignal("use-relay", { requested: true });
  useCloudflareRelay();
}

async function createPeerConnection(generation) {
  if (!webRtcSupported) return null;
  if (peerConnection) closePeerConnection();
  const iceServers = await iceServersPromise;
  if (generation !== connectionGeneration) return null;

  const connection = new RTCPeerConnection({ iceServers: iceServers });
  peerConnection = connection;

  connection.onicecandidate = function (event) {
    if (!event.candidate) return;
    sendSignal("ice-candidate", {
      candidate: event.candidate.candidate,
      sdpMid: event.candidate.sdpMid,
      sdpMLineIndex: event.candidate.sdpMLineIndex,
      usernameFragment: event.candidate.usernameFragment,
    });
  };

  connection.onconnectionstatechange = function () {
    if (generation !== connectionGeneration) return;
    if (connection.connectionState === "failed" || connection.connectionState === "closed") {
      requestCloudflareRelay();
    } else if (connection.connectionState === "disconnected") {
      connectionStatus.textContent = "Trying to reconnect...";
    }
  };

  connection.ondatachannel = function (event) {
    configureDataChannel(event.channel, generation);
  };

  return connection;
}

async function addPendingIceCandidates() {
  if (!peerConnection || !peerConnection.remoteDescription) return;
  const candidates = pendingIceCandidates.splice(0);
  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      // Ignore a stale candidate from a previous negotiation.
    }
  }
}

async function startOffer(generation) {
  if (generation !== connectionGeneration || myPlayer !== "X" || transportMode === "relay") return;
  transportMode = "webrtc";
  const connection = await createPeerConnection(generation);
  if (!connection) {
    requestCloudflareRelay();
    return;
  }
  configureDataChannel(connection.createDataChannel("catbox-game"), generation);
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  sendSignal("offer", serializeSessionDescription(connection.localDescription));
}

async function acceptOffer(offer, generation) {
  if (generation !== connectionGeneration || myPlayer !== "O" || transportMode === "relay") return;
  transportMode = "webrtc";
  const connection = await createPeerConnection(generation);
  if (!connection) {
    requestCloudflareRelay();
    return;
  }
  await connection.setRemoteDescription(offer);
  await addPendingIceCandidates();
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  sendSignal("answer", serializeSessionDescription(connection.localDescription));
}

async function acceptAnswer(answer, generation) {
  if (generation !== connectionGeneration || myPlayer !== "X" || !peerConnection) return;
  await peerConnection.setRemoteDescription(answer);
  await addPendingIceCandidates();
}

async function acceptIceCandidate(candidate) {
  if (!candidate) return;
  if (!peerConnection || !peerConnection.remoteDescription) {
    pendingIceCandidates.push(candidate);
    return;
  }
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (error) {
    console.warn("Ignoring an incompatible ICE candidate", error);
  }
}

async function handleSignalMessage(event, generation) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    return;
  }

  try {
    if (message.type === "joined") {
      myPlayer = message.role === "host" ? "X" : "O";
      connectionStatus.textContent = myPlayer === "X"
        ? "You are X. Send the link to a friend."
        : "You are O. Connecting to your friend...";
      renderBoard();
      sendSignal("capabilities", { webRtc: webRtcSupported });
    } else if (message.type === "peer-joined" && myPlayer === "X") {
      connectionStatus.textContent = "Friend joined. Choosing the best connection...";
      sendSignal("capabilities", { webRtc: webRtcSupported });
    } else if (message.type === "capabilities") {
      if (webRtcSupported && message.payload.webRtc === true) {
        connectionStatus.textContent = "Creating a private connection...";
        if (myPlayer === "X" && transportMode === "pending") await startOffer(generation);
      } else {
        useCloudflareRelay();
      }
    } else if (message.type === "offer" && myPlayer === "O") {
      await acceptOffer(message.payload, generation);
    } else if (message.type === "answer" && myPlayer === "X") {
      await acceptAnswer(message.payload, generation);
    } else if (message.type === "ice-candidate") {
      await acceptIceCandidate(message.payload);
    } else if (message.type === "game-message") {
      handleGameMessage({ data: JSON.stringify(message.payload) });
    } else if (message.type === "use-relay") {
      useCloudflareRelay();
    } else if (message.type === "peer-left") {
      closePeerConnection();
      connectionStatus.textContent = myPlayer === "X"
        ? "Your friend left. The same link can be used again."
        : "The room host left. Create a new link to keep playing.";
    } else if (message.type === "room-full") {
      closePeerConnection();
      myPlayer = null;
      connectionStatus.textContent = "This room already has two players.";
    }
  } catch (error) {
    console.error("WebRTC negotiation failed", error);
    requestCloudflareRelay();
  }
}

function connectToRoom(nextRoomId) {
  const generation = connectionGeneration;
  const socket = new WebSocket(signalingWebSocketOrigin + "/rooms/" + nextRoomId);
  signalingSocket = socket;

  socket.onopen = function () {
    if (generation !== connectionGeneration) return;
    connectionStatus.textContent = "Connected to the room service...";
  };

  socket.onmessage = function (event) {
    if (generation === connectionGeneration) handleSignalMessage(event, generation);
  };

  socket.onerror = function () {
    if (generation !== connectionGeneration || peerConnected) return;
    connectionStatus.textContent = "Online rooms are unavailable right now.";
  };

  socket.onclose = function () {
    if (generation !== connectionGeneration || peerConnected) return;
    connectionStatus.textContent = "The room service disconnected.";
    renderBoard();
  };
}

function switchToOnline(nextRoomId) {
  disconnectOnline();
  mode = "online";
  roomId = nextRoomId;
  updateRoomUrl(roomId);
  setModeButtons();
  resetBoard();

  inviteLink.value = window.location.href;
  connectionStatus.textContent = "Opening your room...";
  iceServersPromise = loadIceServers();
  connectToRoom(roomId);
}

function playTurn(event) {
  const index = Number(event.currentTarget.dataset.cell);
  if (!canPlayCell(index)) return;

  if (mode === "local") {
    applyMove(index, currentPlayer);
  } else if (myPlayer === "X") {
    if (applyMove(index, "X")) sendState();
  } else if (myPlayer === "O" && sendGameMessage({ type: "move", index: index })) {
    movePending = true;
    renderBoard();
  }
}

function restartGame() {
  if (mode === "local") {
    resetBoard(getNextStartingPlayer());
    cells[0].focus();
  } else if (myPlayer === "X" && peerConnected) {
    resetBoard(getNextStartingPlayer());
    sendState();
  } else if (myPlayer === "O" && peerConnected && sendGameMessage({ type: "reset" })) {
    movePending = true;
    statusText.textContent = "Restart requested...";
  }
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
  } catch (error) {
    inviteLink.select();
    document.execCommand("copy");
  }

  copyInviteButton.textContent = "Copied";
  window.setTimeout(function () {
    copyInviteButton.textContent = "Copy";
  }, 1400);
}

cells.forEach(function (cell) {
  cell.addEventListener("click", playTurn);
});

resetButton.addEventListener("click", restartGame);
localModeButton.addEventListener("click", switchToLocal);
onlineModeButton.addEventListener("click", function () {
  if (mode !== "online") switchToOnline(createRoomId());
});
newRoomButton.addEventListener("click", function () {
  switchToOnline(createRoomId());
});
copyInviteButton.addEventListener("click", copyInvite);

window.addEventListener("beforeunload", function () {
  disconnectOnline();
});

const requestedRoomId = new URL(window.location.href).searchParams.get("room");
if (requestedRoomId && isValidRoomId(requestedRoomId)) {
  switchToOnline(requestedRoomId);
} else {
  if (requestedRoomId) updateRoomUrl("");
  setModeButtons();
  renderBoard();
}
