const ROWS = 6;
const COLUMNS = 7;
const EMPTY = "";
const RED = "red";
const YELLOW = "yellow";
const GAME_ID = "connect-4";

const columns = Array.from(document.querySelectorAll(".c4-column"));
const statusElement = document.querySelector("#game-status");
const localModeButton = document.querySelector("#local-mode");
const onlineModeButton = document.querySelector("#online-mode");
const onlinePanel = document.querySelector("#online-panel");
const connectionStatus = document.querySelector("#connection-status");
const inviteLink = document.querySelector("#invite-link");
const copyInviteButton = document.querySelector("#copy-invite");
const newRoomButton = document.querySelector("#new-room");
const rematchPanel = document.querySelector("#rematch-panel");
const rematchButton = document.querySelector("#rematch-button");
const confettiElement = document.querySelector("#confetti");

const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const signalingHttpOrigin = isLocalDevelopment
  ? "http://localhost:8787"
  : "https://multiplayer.catbox.party";
const signalingWebSocketOrigin = signalingHttpOrigin.replace(/^http/, "ws");
const fallbackIceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
const webRtcSupported = typeof window.RTCPeerConnection === "function";
const confettiColors = ["#ff6b55", "#f4cf4f", "#6fa8ff", "#7fd09a", "#f3a8c5", "#ad95e8"];

let mode = "local";
let board = createBoard();
let currentPlayer = RED;
let roundStartingPlayer = RED;
let roundOver = false;
let winningCells = null;
let newestDisc = null;
let newestDiscTimer = null;
let celebratedWinner = null;
let confettiTimer = null;
let rematchRequestedByMe = false;
let rematchRequestedByPeer = false;
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
let connectionFallbackTimer = null;

function createBoard() {
  return Array.from({ length: ROWS }, function () {
    return Array(COLUMNS).fill(EMPTY);
  });
}

function playerName(player) {
  return player === RED ? "Red" : "Yellow";
}

function otherPlayer(player) {
  return player === RED ? YELLOW : RED;
}

function buildBoard() {
  columns.forEach(function (column, columnIndex) {
    column.replaceChildren();
    for (let row = 0; row < ROWS; row += 1) {
      const cell = document.createElement("span");
      cell.className = "c4-cell is-empty";
      cell.dataset.row = String(row);
      cell.dataset.column = String(columnIndex);
      cell.setAttribute("aria-hidden", "true");
      column.appendChild(cell);
    }
  });
}

function findOpenRow(column) {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === EMPTY) return row;
  }
  return -1;
}

function cellAt(row, column) {
  return columns[column].querySelector('[data-row="' + row + '"]');
}

function cellIsWinning(row, column) {
  return Boolean(winningCells && winningCells.some(function (cell) {
    return cell[0] === row && cell[1] === column;
  }));
}

function canPlayColumn(column) {
  if (roundOver || findOpenRow(column) === -1) return false;
  if (mode === "local") return true;
  return peerConnected && !movePending && currentPlayer === myPlayer;
}

function getResultMessage() {
  if (winningCells) {
    const winner = board[winningCells[0][0]][winningCells[0][1]];
    if (mode === "online") return winner === myPlayer ? "You Win!" : "You Lose!";
    return playerName(winner) + " wins!";
  }
  if (roundOver) return "It's a draw!";
  return null;
}

function renderRematchPrompt() {
  if (!roundOver) {
    rematchPanel.hidden = true;
    return;
  }
  rematchPanel.hidden = false;
  rematchButton.disabled = false;
  if (mode === "local") {
    rematchButton.textContent = "Rematch";
  } else if (!peerConnected) {
    rematchButton.textContent = "Waiting for friend...";
    rematchButton.disabled = true;
  } else if (rematchRequestedByMe && rematchRequestedByPeer) {
    rematchButton.textContent = "Starting...";
    rematchButton.disabled = true;
  } else if (rematchRequestedByMe) {
    rematchButton.textContent = "Waiting for friend...";
    rematchButton.disabled = true;
  } else if (rematchRequestedByPeer) {
    rematchButton.textContent = "Accept Rematch";
  } else {
    rematchButton.textContent = "Rematch";
  }
}

function renderBoard() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const value = board[row][column];
      const cell = cellAt(row, column);
      cell.className = "c4-cell";
      cell.classList.add(value ? "is-" + value : "is-empty");
      cell.classList.toggle(
        "is-new",
        Boolean(newestDisc && newestDisc[0] === row && newestDisc[1] === column),
      );
      cell.classList.toggle("is-win", cellIsWinning(row, column));
    }
  }

  columns.forEach(function (columnButton, column) {
    const openRow = findOpenRow(column);
    columnButton.disabled = !canPlayColumn(column);
    if (openRow === -1) {
      columnButton.setAttribute("aria-label", "Column " + (column + 1) + " is full");
    } else {
      columnButton.setAttribute(
        "aria-label",
        "Drop a " + playerName(currentPlayer).toLowerCase() + " disc in column " + (column + 1),
      );
    }
  });

  const resultMessage = getResultMessage();
  if (resultMessage) {
    statusElement.textContent = resultMessage;
  } else if (mode === "local") {
    statusElement.textContent = playerName(currentPlayer) + "'s turn";
  } else if (!peerConnected) {
    statusElement.textContent = "Waiting for a friend...";
  } else if (movePending) {
    statusElement.textContent = "Move sent...";
  } else if (currentPlayer === myPlayer) {
    statusElement.textContent = "Your turn (" + playerName(myPlayer) + ")";
  } else {
    statusElement.textContent = "Friend's turn (" + playerName(currentPlayer) + ")";
  }
  renderRematchPrompt();
}

function animateNewestDisc(row, column) {
  if (newestDiscTimer) window.clearTimeout(newestDiscTimer);
  newestDisc = [row, column];
  newestDiscTimer = window.setTimeout(function () {
    const cell = cellAt(row, column);
    if (cell) cell.classList.remove("is-new");
    newestDisc = null;
    newestDiscTimer = null;
  }, 350);
}

function findWinningCells(row, column, player) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const direction of directions) {
    const rowStep = direction[0];
    const columnStep = direction[1];
    const cells = [[row, column]];
    for (const sign of [-1, 1]) {
      let nextRow = row + rowStep * sign;
      let nextColumn = column + columnStep * sign;
      while (
        nextRow >= 0
        && nextRow < ROWS
        && nextColumn >= 0
        && nextColumn < COLUMNS
        && board[nextRow][nextColumn] === player
      ) {
        cells.push([nextRow, nextColumn]);
        nextRow += rowStep * sign;
        nextColumn += columnStep * sign;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

function isDraw() {
  return board[0].every(function (cell) { return cell !== EMPTY; });
}

function getNextStartingPlayer() {
  if (winningCells) {
    const winner = board[winningCells[0][0]][winningCells[0][1]];
    return otherPlayer(winner);
  }
  if (roundOver) return otherPlayer(roundStartingPlayer);
  return RED;
}

function clearConfetti() {
  if (confettiTimer) {
    window.clearTimeout(confettiTimer);
    confettiTimer = null;
  }
  confettiElement.replaceChildren();
}

function resetCelebration() {
  celebratedWinner = null;
  clearConfetti();
}

function clearRematchAgreement() {
  rematchRequestedByMe = false;
  rematchRequestedByPeer = false;
}

function celebrateWinner() {
  if (!winningCells) return;
  const winner = board[winningCells[0][0]][winningCells[0][1]];
  if (celebratedWinner === winner) return;
  celebratedWinner = winner;
  const winnerShouldCelebrate = mode === "local" || winner === myPlayer;
  const reducedMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!winnerShouldCelebrate || reducedMotion) return;

  clearConfetti();
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 90; index += 1) {
    const piece = document.createElement("span");
    piece.className = "c4-confetti-piece";
    piece.style.setProperty("--confetti-x", Math.random() * 100 + "vw");
    piece.style.setProperty("--confetti-color", confettiColors[index % confettiColors.length]);
    piece.style.setProperty("--confetti-duration", 2.6 + Math.random() * 1.8 + "s");
    piece.style.setProperty("--confetti-delay", Math.random() * 0.7 + "s");
    piece.style.setProperty("--confetti-drift", Math.random() * 30 - 15 + "vw");
    piece.style.setProperty("--confetti-rotation", 540 + Math.random() * 720 + "deg");
    fragment.appendChild(piece);
  }
  confettiElement.appendChild(fragment);
  confettiTimer = window.setTimeout(clearConfetti, 5200);
}

function resetBoard(startingPlayer = RED) {
  board = createBoard();
  currentPlayer = startingPlayer;
  roundStartingPlayer = startingPlayer;
  roundOver = false;
  winningCells = null;
  newestDisc = null;
  movePending = false;
  clearRematchAgreement();
  resetCelebration();
  renderBoard();
}

function applyMove(column, player) {
  if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) return false;
  if (roundOver || currentPlayer !== player) return false;
  const row = findOpenRow(column);
  if (row === -1) return false;
  board[row][column] = player;
  animateNewestDisc(row, column);
  winningCells = findWinningCells(row, column, player);
  if (winningCells || isDraw()) roundOver = true;
  else currentPlayer = otherPlayer(currentPlayer);
  renderBoard();
  celebrateWinner();
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
  if (nextRoomId) url.searchParams.set("room", nextRoomId);
  else url.searchParams.delete("room");
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
  clearRematchAgreement();
  pendingIceCandidates = [];
  transportMode = "pending";
  if (connectionFallbackTimer) {
    window.clearTimeout(connectionFallbackTimer);
    connectionFallbackTimer = null;
  }
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
  columns[0].focus();
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
  return { type: description.type, sdp: description.sdp };
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
    game: GAME_ID,
    board: board.map(function (row) { return row.slice(); }),
    currentPlayer: currentPlayer,
    roundOver: roundOver,
    winningCells: winningCells,
    roundStartingPlayer: roundStartingPlayer,
  };
}

function sendState() {
  if (myPlayer === RED) sendGameMessage(currentStateMessage());
}

function isValidState(message) {
  const validBoard = Array.isArray(message.board)
    && message.board.length === ROWS
    && message.board.every(function (row) {
      return Array.isArray(row)
        && row.length === COLUMNS
        && row.every(function (value) {
          return value === EMPTY || value === RED || value === YELLOW;
        });
    });
  const validWinningCells = message.winningCells === null
    || (Array.isArray(message.winningCells)
      && message.winningCells.length >= 4
      && message.winningCells.length <= 7
      && message.winningCells.every(function (cell) {
        return Array.isArray(cell)
          && cell.length === 2
          && Number.isInteger(cell[0])
          && cell[0] >= 0
          && cell[0] < ROWS
          && Number.isInteger(cell[1])
          && cell[1] >= 0
          && cell[1] < COLUMNS;
      }));
  return message.type === "state"
    && message.game === GAME_ID
    && validBoard
    && (message.currentPlayer === RED || message.currentPlayer === YELLOW)
    && typeof message.roundOver === "boolean"
    && validWinningCells
    && (message.roundStartingPlayer === RED || message.roundStartingPlayer === YELLOW);
}

function findNewDisc(previousBoard, nextBoard) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      if (previousBoard[row][column] === EMPTY && nextBoard[row][column] !== EMPTY) {
        return [row, column];
      }
    }
  }
  return null;
}

function beginOnlineRematchIfReady() {
  if (
    myPlayer !== RED
    || !roundOver
    || !rematchRequestedByMe
    || !rematchRequestedByPeer
  ) return;
  const nextStartingPlayer = getNextStartingPlayer();
  resetBoard(nextStartingPlayer);
  sendState();
}

function handleGameMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    return;
  }
  if (message.game !== GAME_ID) return;

  if (message.type === "rematch-request" && roundOver) {
    rematchRequestedByPeer = true;
    renderBoard();
    beginOnlineRematchIfReady();
    return;
  }
  if (myPlayer === RED) {
    if (message.type === "move") {
      applyMove(message.column, YELLOW);
      sendState();
    }
    return;
  }
  if (myPlayer === YELLOW && isValidState(message)) {
    const nextDisc = findNewDisc(board, message.board);
    board = message.board.map(function (row) { return row.slice(); });
    currentPlayer = message.currentPlayer;
    roundOver = message.roundOver;
    winningCells = message.winningCells
      ? message.winningCells.map(function (cell) { return cell.slice(); })
      : null;
    roundStartingPlayer = message.roundStartingPlayer;
    movePending = false;
    if (!roundOver) clearRematchAgreement();
    if (!winningCells) resetCelebration();
    if (nextDisc) animateNewestDisc(nextDisc[0], nextDisc[1]);
    renderBoard();
    celebrateWinner();
  }
}

function configureDataChannel(channel, generation) {
  dataChannel = channel;
  channel.onopen = function () {
    if (generation !== connectionGeneration) return;
    peerConnected = true;
    movePending = false;
    connectionStatus.textContent = "Connected — you are " + playerName(myPlayer) + ".";
    renderBoard();
    if (myPlayer === RED) sendState();
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
  connectionStatus.textContent = "Connected — you are " + playerName(myPlayer) + ".";
  renderBoard();
  if (myPlayer === RED) sendState();
}

function requestCloudflareRelay() {
  sendSignal("use-relay", { requested: true });
  useCloudflareRelay();
}

function scheduleConnectionFallback(generation) {
  if (connectionFallbackTimer) window.clearTimeout(connectionFallbackTimer);
  connectionFallbackTimer = window.setTimeout(function () {
    connectionFallbackTimer = null;
    if (
      generation === connectionGeneration
      && !peerConnected
      && transportMode === "webrtc"
    ) requestCloudflareRelay();
  }, 8000);
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
  if (generation !== connectionGeneration || myPlayer !== RED || transportMode === "relay") return;
  transportMode = "webrtc";
  const connection = await createPeerConnection(generation);
  if (!connection) {
    requestCloudflareRelay();
    return;
  }
  configureDataChannel(connection.createDataChannel("catbox-connect-4"), generation);
  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  sendSignal("offer", serializeSessionDescription(connection.localDescription));
  scheduleConnectionFallback(generation);
}

async function acceptOffer(offer, generation) {
  if (generation !== connectionGeneration || myPlayer !== YELLOW || transportMode === "relay") return;
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
  scheduleConnectionFallback(generation);
}

async function acceptAnswer(answer, generation) {
  if (generation !== connectionGeneration || myPlayer !== RED || !peerConnection) return;
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
      myPlayer = message.role === "host" ? RED : YELLOW;
      connectionStatus.textContent = myPlayer === RED
        ? "You are Red. Send the link to a friend."
        : "You are Yellow. Connecting to your friend...";
      renderBoard();
      sendSignal("capabilities", { webRtc: webRtcSupported });
    } else if (message.type === "peer-joined" && myPlayer === RED) {
      connectionStatus.textContent = "Friend joined. Choosing the best connection...";
      sendSignal("capabilities", { webRtc: webRtcSupported });
    } else if (message.type === "capabilities") {
      if (webRtcSupported && message.payload.webRtc === true) {
        connectionStatus.textContent = "Creating a private connection...";
        if (myPlayer === RED && transportMode === "pending") await startOffer(generation);
      } else {
        useCloudflareRelay();
      }
    } else if (message.type === "offer" && myPlayer === YELLOW) {
      await acceptOffer(message.payload, generation);
    } else if (message.type === "answer" && myPlayer === RED) {
      await acceptAnswer(message.payload, generation);
    } else if (message.type === "ice-candidate") {
      await acceptIceCandidate(message.payload);
    } else if (message.type === "game-message") {
      handleGameMessage({ data: JSON.stringify(message.payload) });
    } else if (message.type === "use-relay") {
      useCloudflareRelay();
    } else if (message.type === "peer-left") {
      closePeerConnection();
      connectionStatus.textContent = myPlayer === RED
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

function playColumn(column) {
  if (!canPlayColumn(column)) return;
  if (mode === "local") {
    applyMove(column, currentPlayer);
  } else if (myPlayer === RED) {
    if (applyMove(column, RED)) sendState();
  } else if (
    myPlayer === YELLOW
    && sendGameMessage({ type: "move", game: GAME_ID, column: column })
  ) {
    movePending = true;
    renderBoard();
  }
}

function requestRematch() {
  if (!roundOver) return;
  if (mode === "local") {
    resetBoard(getNextStartingPlayer());
    columns[0].focus();
    return;
  }
  if (!peerConnected || !myPlayer || rematchRequestedByMe) return;
  rematchRequestedByMe = true;
  if (!sendGameMessage({ type: "rematch-request", game: GAME_ID })) {
    rematchRequestedByMe = false;
  }
  renderBoard();
  beginOnlineRematchIfReady();
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

columns.forEach(function (columnButton) {
  columnButton.addEventListener("click", function () {
    playColumn(Number(columnButton.dataset.column));
  });
});
rematchButton.addEventListener("click", requestRematch);
localModeButton.addEventListener("click", switchToLocal);
onlineModeButton.addEventListener("click", function () {
  if (mode !== "online") switchToOnline(createRoomId());
});
newRoomButton.addEventListener("click", function () {
  switchToOnline(createRoomId());
});
copyInviteButton.addEventListener("click", copyInvite);
window.addEventListener("beforeunload", disconnectOnline);

buildBoard();
const requestedRoomId = new URL(window.location.href).searchParams.get("room");
if (requestedRoomId && isValidRoomId(requestedRoomId)) {
  switchToOnline(requestedRoomId);
} else {
  if (requestedRoomId) updateRoomUrl("");
  setModeButtons();
  renderBoard();
}
