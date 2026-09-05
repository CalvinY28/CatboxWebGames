const ROWS = 6;
const COLUMNS = 7;
const EMPTY = "";
const RED = "red";
const YELLOW = "yellow";

const boardElement = document.querySelector("#game-board");
const columns = [...document.querySelectorAll(".c4-column")];
const statusElement = document.querySelector("#game-status");
const rematchPanel = document.querySelector("#rematch-panel");
const rematchButton = document.querySelector("#rematch-button");
const confettiElement = document.querySelector("#confetti");

let board = createBoard();
let currentPlayer = RED;
let startingPlayer = RED;
let roundOver = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(EMPTY));
}

function playerName(player) {
  return player === RED ? "Red" : "Yellow";
}

function otherPlayer(player) {
  return player === RED ? YELLOW : RED;
}

function buildBoard() {
  columns.forEach((column, columnIndex) => {
    column.replaceChildren();

    for (let row = 0; row < ROWS; row += 1) {
      const cell = document.createElement("span");
      cell.className = "c4-cell is-empty";
      cell.dataset.row = String(row);
      cell.dataset.column = String(columnIndex);
      cell.setAttribute("aria-hidden", "true");
      column.append(cell);
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
  return columns[column].querySelector(`[data-row="${row}"]`);
}

function renderDisc(row, column, player) {
  const cell = cellAt(row, column);
  cell.className = `c4-cell is-${player} is-new`;
  window.setTimeout(() => cell.classList.remove("is-new"), 350);
}

function updateColumn(column) {
  const button = columns[column];
  const openRow = findOpenRow(column);
  button.disabled = roundOver || openRow === -1;

  if (openRow === -1) {
    button.setAttribute("aria-label", `Column ${column + 1} is full`);
  } else {
    button.setAttribute("aria-label", `Drop a ${playerName(currentPlayer).toLowerCase()} disc in column ${column + 1}`);
  }
}

function updateAllColumns() {
  columns.forEach((_, column) => updateColumn(column));
}

function findWinningCells(row, column, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [rowStep, columnStep] of directions) {
    const cells = [[row, column]];

    for (const direction of [-1, 1]) {
      let nextRow = row + rowStep * direction;
      let nextColumn = column + columnStep * direction;

      while (
        nextRow >= 0 &&
        nextRow < ROWS &&
        nextColumn >= 0 &&
        nextColumn < COLUMNS &&
        board[nextRow][nextColumn] === player
      ) {
        cells.push([nextRow, nextColumn]);
        nextRow += rowStep * direction;
        nextColumn += columnStep * direction;
      }
    }

    if (cells.length >= 4) return cells;
  }

  return null;
}

function isDraw() {
  return board[0].every((cell) => cell !== EMPTY);
}

function showConfetti() {
  const colors = ["#ff6b55", "#f4cf4f", "#6fa8ff", "#7fd09a", "#f3a8c5", "#ad95e8"];
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement("span");
    piece.className = "c4-confetti-piece";
    piece.style.setProperty("--confetti-x", `${Math.random() * 100}%`);
    piece.style.setProperty("--confetti-color", colors[index % colors.length]);
    piece.style.setProperty("--confetti-duration", `${1.8 + Math.random() * 1.8}s`);
    piece.style.setProperty("--confetti-delay", `${Math.random() * 0.45}s`);
    piece.style.setProperty("--confetti-drift", `${-80 + Math.random() * 160}px`);
    piece.style.setProperty("--confetti-rotation", `${360 + Math.random() * 720}deg`);
    fragment.append(piece);
  }

  confettiElement.replaceChildren(fragment);
  window.setTimeout(() => confettiElement.replaceChildren(), 4300);
}

function finishRound(winner, winningCells = []) {
  roundOver = true;

  if (winner) {
    statusElement.textContent = `${playerName(winner)} wins!`;
    winningCells.forEach(([row, column]) => cellAt(row, column).classList.add("is-win"));
    startingPlayer = otherPlayer(winner);
    showConfetti();
  } else {
    statusElement.textContent = "It's a draw!";
    startingPlayer = otherPlayer(startingPlayer);
  }

  updateAllColumns();
  rematchPanel.hidden = false;
  rematchButton.focus();
}

function playColumn(column) {
  if (roundOver) return;

  const row = findOpenRow(column);
  if (row === -1) return;

  const player = currentPlayer;
  board[row][column] = player;
  renderDisc(row, column, player);

  const winningCells = findWinningCells(row, column, player);
  if (winningCells) {
    finishRound(player, winningCells);
    return;
  }

  if (isDraw()) {
    finishRound(null);
    return;
  }

  currentPlayer = otherPlayer(currentPlayer);
  statusElement.textContent = `${playerName(currentPlayer)}'s turn`;
  updateAllColumns();
}

function beginRound() {
  board = createBoard();
  currentPlayer = startingPlayer;
  roundOver = false;
  rematchPanel.hidden = true;
  statusElement.textContent = `${playerName(currentPlayer)}'s turn`;
  buildBoard();
  updateAllColumns();
}

columns.forEach((column) => {
  column.addEventListener("click", () => playColumn(Number(column.dataset.column)));
});

rematchButton.addEventListener("click", beginRound);

buildBoard();
updateAllColumns();
