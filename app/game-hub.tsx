"use client";

import { useMemo, useState } from "react";
import {
  Anchor,
  CircleDot,
  Clock3,
  Gamepad2,
  Grid3X3,
  RotateCcw,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type GameId = "tic-tac-toe" | "connect-four" | "battleship";
type Mark = "X" | "O";
type Disc = "coral" | "gold";
type Score = [number, number];

const games: Array<{
  id: GameId;
  label: string;
  kicker: string;
  description: string;
  icon: typeof Grid3X3;
}> = [
  {
    id: "tic-tac-toe",
    label: "Tic-Tac-Toe",
    kicker: "Quick classic",
    description: "Three in a row wins. No pencils required.",
    icon: Grid3X3,
  },
  {
    id: "connect-four",
    label: "Connect Four",
    kicker: "Local duel",
    description: "Drop a disc and race to connect four.",
    icon: CircleDot,
  },
  {
    id: "battleship",
    label: "Pocket Fleet",
    kicker: "Solo strategy",
    description: "Find the computer fleet before it finds yours.",
    icon: Anchor,
  },
];

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

function ticWinner(board: Array<Mark | null>) {
  for (const [a, b, c] of winningLines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function TicTacToe({ score, onScore }: { score: Score; onScore: (player: 0 | 1) => void }) {
  const [board, setBoard] = useState<Array<Mark | null>>(Array(9).fill(null));
  const [turn, setTurn] = useState<Mark>("X");
  const winner = ticWinner(board);
  const draw = !winner && board.every(Boolean);

  function play(index: number) {
    if (board[index] || winner) return;
    const next = [...board];
    next[index] = turn;
    setBoard(next);
    const nextWinner = ticWinner(next);
    if (nextWinner) onScore(nextWinner === "X" ? 0 : 1);
    else setTurn(turn === "X" ? "O" : "X");
  }

  function reset() {
    setBoard(Array(9).fill(null));
    setTurn("X");
  }

  const status = winner ? `${winner} wins this round!` : draw ? "Cat's game — it's a draw." : `${turn}'s turn`;

  return (
    <GameFrame
      eyebrow="Two players · one screen"
      title="Tic-Tac-Toe"
      status={status}
      score={score}
      scoreLabels={["Player X", "Player O"]}
      onReset={reset}
    >
      <div className="tic-grid" role="grid" aria-label="Tic-Tac-Toe board">
        {board.map((cell, index) => (
          <button
            className={`tic-cell ${cell ? `tic-${cell.toLowerCase()}` : ""}`}
            key={index}
            onClick={() => play(index)}
            aria-label={`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}${cell ? `, ${cell}` : ""}`}
            disabled={Boolean(cell) || Boolean(winner)}
          >
            {cell}
          </button>
        ))}
      </div>
    </GameFrame>
  );
}

function connectWinner(board: Array<Disc | null>, row: number, column: number, disc: Disc) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  return directions.some(([rowStep, columnStep]) => {
    let count = 1;
    for (const sign of [-1, 1]) {
      let nextRow = row + rowStep * sign;
      let nextColumn = column + columnStep * sign;
      while (
        nextRow >= 0 &&
        nextRow < 6 &&
        nextColumn >= 0 &&
        nextColumn < 7 &&
        board[nextRow * 7 + nextColumn] === disc
      ) {
        count += 1;
        nextRow += rowStep * sign;
        nextColumn += columnStep * sign;
      }
    }
    return count >= 4;
  });
}

function ConnectFour({ score, onScore }: { score: Score; onScore: (player: 0 | 1) => void }) {
  const [board, setBoard] = useState<Array<Disc | null>>(Array(42).fill(null));
  const [turn, setTurn] = useState<Disc>("coral");
  const [winner, setWinner] = useState<Disc | null>(null);

  function play(column: number) {
    if (winner) return;
    let row = 5;
    while (row >= 0 && board[row * 7 + column]) row -= 1;
    if (row < 0) return;

    const next = [...board];
    next[row * 7 + column] = turn;
    setBoard(next);
    if (connectWinner(next, row, column, turn)) {
      setWinner(turn);
      onScore(turn === "coral" ? 0 : 1);
    } else {
      setTurn(turn === "coral" ? "gold" : "coral");
    }
  }

  function reset() {
    setBoard(Array(42).fill(null));
    setTurn("coral");
    setWinner(null);
  }

  const draw = !winner && board.every(Boolean);
  const status = winner
    ? `${winner === "coral" ? "Coral" : "Gold"} wins this round!`
    : draw
      ? "Board full — call it a draw."
      : `${turn === "coral" ? "Coral" : "Gold"}'s turn`;

  return (
    <GameFrame
      eyebrow="Two players · one screen"
      title="Connect Four"
      status={status}
      score={score}
      scoreLabels={["Coral", "Gold"]}
      onReset={reset}
    >
      <div className="connect-wrap">
        <div className="column-buttons" aria-label="Choose a column">
          {Array.from({ length: 7 }, (_, column) => (
            <button key={column} onClick={() => play(column)} aria-label={`Drop in column ${column + 1}`} disabled={Boolean(winner)}>
              ↓
            </button>
          ))}
        </div>
        <div className="connect-grid" role="grid" aria-label="Connect Four board">
          {board.map((cell, index) => (
            <div className="connect-slot" key={index} role="gridcell" aria-label={cell ?? "Empty"}>
              <span className={cell ? `disc disc-${cell}` : "disc"} />
            </div>
          ))}
        </div>
      </div>
    </GameFrame>
  );
}

function seededRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function placeFleet(seed: number) {
  const lengths = [3, 2, 2];
  const occupied = new Set<number>();
  let attempt = 0;

  for (const length of lengths) {
    let placed = false;
    while (!placed && attempt < 200) {
      attempt += 1;
      const horizontal = seededRandom(seed + attempt * 11) > 0.5;
      const maxRow = horizontal ? 5 : 6 - length;
      const maxColumn = horizontal ? 6 - length : 5;
      const row = Math.floor(seededRandom(seed + attempt * 17) * (maxRow + 1));
      const column = Math.floor(seededRandom(seed + attempt * 23) * (maxColumn + 1));
      const cells = Array.from({ length }, (_, offset) =>
        horizontal ? row * 6 + column + offset : (row + offset) * 6 + column,
      );
      if (cells.every((cell) => !occupied.has(cell))) {
        cells.forEach((cell) => occupied.add(cell));
        placed = true;
      }
    }
  }

  return [...occupied];
}

function PocketFleet({ score, onScore }: { score: Score; onScore: (player: 0 | 1) => void }) {
  const [round, setRound] = useState(1);
  const [yourShots, setYourShots] = useState<number[]>([]);
  const [botShots, setBotShots] = useState<number[]>([]);
  const [winner, setWinner] = useState<"you" | "bot" | null>(null);
  const yourFleet = useMemo(() => placeFleet(round * 41), [round]);
  const botFleet = useMemo(() => placeFleet(round * 73 + 9), [round]);

  function shoot(index: number) {
    if (winner || yourShots.includes(index)) return;

    const nextYourShots = [...yourShots, index];
    setYourShots(nextYourShots);
    if (botFleet.every((cell) => nextYourShots.includes(cell))) {
      setWinner("you");
      onScore(0);
      return;
    }

    const available = Array.from({ length: 36 }, (_, cell) => cell).filter((cell) => !botShots.includes(cell));
    const botPick = available[Math.floor(seededRandom(round * 97 + botShots.length * 31) * available.length)];
    const nextBotShots = [...botShots, botPick];
    setBotShots(nextBotShots);
    if (yourFleet.every((cell) => nextBotShots.includes(cell))) {
      setWinner("bot");
      onScore(1);
    }
  }

  function reset() {
    setRound((value) => value + 1);
    setYourShots([]);
    setBotShots([]);
    setWinner(null);
  }

  const lastShot = yourShots.at(-1);
  const status = winner
    ? winner === "you"
      ? "Fleet found — you win!"
      : "Your fleet sank — the computer wins."
    : lastShot === undefined
      ? "Choose a square on enemy waters."
      : botFleet.includes(lastShot)
        ? "Direct hit! The computer fired back."
        : "Splash. The computer fired back.";

  return (
    <GameFrame
      eyebrow="One player · vs computer"
      title="Pocket Fleet"
      status={status}
      score={score}
      scoreLabels={["You", "Computer"]}
      onReset={reset}
    >
      <div className="fleet-layout">
        <FleetBoard title="Your fleet" fleet={yourFleet} shots={botShots} reveal />
        <FleetBoard title="Enemy waters" fleet={botFleet} shots={yourShots} onShoot={shoot} disabled={Boolean(winner)} />
      </div>
      <p className="fleet-note">Pocket rules: three ships on a 6 × 6 grid. Sink all seven ship tiles to win.</p>
    </GameFrame>
  );
}

function FleetBoard({
  title,
  fleet,
  shots,
  reveal = false,
  disabled = false,
  onShoot,
}: {
  title: string;
  fleet: number[];
  shots: number[];
  reveal?: boolean;
  disabled?: boolean;
  onShoot?: (index: number) => void;
}) {
  return (
    <div>
      <div className="fleet-title">
        <span>{title}</span>
        <span>{shots.filter((shot) => fleet.includes(shot)).length}/7 hits</span>
      </div>
      <div className="fleet-grid" role="grid" aria-label={title}>
        {Array.from({ length: 36 }, (_, index) => {
          const ship = fleet.includes(index);
          const shot = shots.includes(index);
          const state = shot ? (ship ? "hit" : "miss") : reveal && ship ? "ship" : "water";
          return (
            <button
              className={`fleet-cell fleet-${state}`}
              key={index}
              onClick={() => onShoot?.(index)}
              disabled={disabled || !onShoot || shot}
              aria-label={`${title}, row ${Math.floor(index / 6) + 1}, column ${(index % 6) + 1}, ${state}`}
            >
              {shot ? (ship ? "×" : "·") : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameFrame({
  eyebrow,
  title,
  status,
  score,
  scoreLabels,
  onReset,
  children,
}: {
  eyebrow: string;
  title: string;
  status: string;
  score: Score;
  scoreLabels: [string, string];
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="game-frame">
      <div className="game-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <Button variant="outline" onClick={onReset} className="reset-button">
          <RotateCcw /> New round
        </Button>
      </div>
      <div className="score-strip" aria-label="Score">
        <span>{scoreLabels[0]} <strong>{score[0]}</strong></span>
        <span className="status-pill" aria-live="polite">{status}</span>
        <span><strong>{score[1]}</strong> {scoreLabels[1]}</span>
      </div>
      <div className="game-stage">{children}</div>
    </section>
  );
}

export default function GameHub() {
  const [activeGame, setActiveGame] = useState<GameId>("tic-tac-toe");
  const [scores, setScores] = useState<Record<GameId, Score>>({
    "tic-tac-toe": [0, 0],
    "connect-four": [0, 0],
    battleship: [0, 0],
  });

  function chooseGame(game: GameId) {
    setActiveGame(game);
    requestAnimationFrame(() => document.getElementById("play")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addScore(game: GameId, player: 0 | 1) {
    setScores((current) => {
      const next: Score = [...current[game]];
      next[player] += 1;
      return { ...current, [game]: next };
    });
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Catbox Games home">
          <span className="brand-mark"><Gamepad2 /></span>
          <span>CATBOX</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#games">Games</a>
          <a href="#about">About</a>
          <Button asChild size="sm" className="header-play"><a href="#play">Play now</a></Button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="hero-tag"><Sparkles /> Homemade browser games</div>
          <h1>Tiny games.<br /><span>Big rematches.</span></h1>
          <p>Pick a classic, pass the screen, and settle the score. No account, no download, no fuss.</p>
          <div className="hero-actions">
            <Button asChild size="lg" className="primary-cta"><a href="#play"><Gamepad2 /> Start playing</a></Button>
            <span><span className="online-dot" /> Free to play</span>
          </div>
        </div>
        <div className="hero-art-wrap">
          <img className="hero-art" src="/og.jpg" alt="A playful cat enjoying a colorful tabletop arcade" />
          <div className="floating-note note-one"><UsersRound /> Local multiplayer</div>
          <div className="floating-note note-two"><Clock3 /> 5-minute fun</div>
        </div>
      </section>

      <section className="game-picker" id="games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pick your game</p>
            <h2>What are we playing?</h2>
          </div>
          <p>Three classics, rebuilt for quick rounds on desktop or mobile.</p>
        </div>
        <div className="game-cards">
          {games.map((game) => {
            const Icon = game.icon;
            return (
              <button className={`game-card game-card-${game.id}`} key={game.id} onClick={() => chooseGame(game.id)}>
                <span className="game-icon"><Icon /></span>
                <span className="game-kicker">{game.kicker}</span>
                <strong>{game.label}</strong>
                <span>{game.description}</span>
                <span className="card-link">Play game <span>→</span></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="arcade" id="play">
        <div className="game-tabs" role="tablist" aria-label="Choose a game">
          {games.map((game) => {
            const Icon = game.icon;
            return (
              <button
                key={game.id}
                className={activeGame === game.id ? "active" : ""}
                onClick={() => setActiveGame(game.id)}
                role="tab"
                aria-selected={activeGame === game.id}
              >
                <Icon /> <span>{game.label}</span>
              </button>
            );
          })}
        </div>
        {activeGame === "tic-tac-toe" && <TicTacToe score={scores[activeGame]} onScore={(player) => addScore(activeGame, player)} />}
        {activeGame === "connect-four" && <ConnectFour score={scores[activeGame]} onScore={(player) => addScore(activeGame, player)} />}
        {activeGame === "battleship" && <PocketFleet score={scores[activeGame]} onScore={(player) => addScore(activeGame, player)} />}
      </section>

      <section className="about" id="about">
        <div>
          <p className="eyebrow">Made with care</p>
          <h2>Classic games, no clutter.</h2>
        </div>
        <p>Catbox is a growing collection of homemade web games built for quick breaks, friendly rivalries, and anyone who misses passing a game across the table.</p>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark"><Gamepad2 /></span><span>CATBOX</span></a>
        <p>Made for rematches. © {new Date().getFullYear()} Catbox Games.</p>
        <a href="#games">Back to games ↑</a>
      </footer>
    </main>
  );
}
