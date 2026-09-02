const cells = Array.from(document.querySelectorAll("[data-cell]"));
const statusText = document.querySelector("#game-status");
const resetButton = document.querySelector("#reset-game");

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

let board = Array(9).fill("");
let currentPlayer = "X";
let gameFinished = false;

function findWinningLine() {
  return winningLines.find(function (line) {
    const first = board[line[0]];
    return first && line.every(function (index) {
      return board[index] === first;
    });
  });
}

function updateStatus(message) {
  statusText.textContent = message;
}

function finishGame(message, winningLine) {
  gameFinished = true;
  cells.forEach(function (cell) {
    cell.disabled = true;
  });

  if (winningLine) {
    winningLine.forEach(function (index) {
      cells[index].classList.add("cell-win");
    });
  }

  updateStatus(message);
}

function playTurn(event) {
  if (gameFinished) return;

  const cell = event.currentTarget;
  const index = Number(cell.dataset.cell);
  if (board[index]) return;

  board[index] = currentPlayer;
  cell.textContent = currentPlayer;
  cell.classList.add(currentPlayer === "X" ? "cell-x" : "cell-o");
  cell.setAttribute("aria-label", cell.dataset.label + ", " + currentPlayer);
  cell.disabled = true;

  const winningLine = findWinningLine();
  if (winningLine) {
    finishGame("Player " + currentPlayer + " wins!", winningLine);
    return;
  }

  if (board.every(Boolean)) {
    finishGame("It's a draw.");
    return;
  }

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  updateStatus("Player " + currentPlayer + "'s turn");
}

function resetGame() {
  board = Array(9).fill("");
  currentPlayer = "X";
  gameFinished = false;

  cells.forEach(function (cell) {
    cell.textContent = "";
    cell.disabled = false;
    cell.classList.remove("cell-x", "cell-o", "cell-win");
    cell.setAttribute("aria-label", cell.dataset.label + ", empty");
  });

  updateStatus("Player X's turn");
  cells[0].focus();
}

cells.forEach(function (cell) {
  cell.addEventListener("click", playTurn);
});

resetButton.addEventListener("click", resetGame);
