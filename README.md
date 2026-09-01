# Catbox Web Games

Source code for [catbox.party](https://catbox.party), a collection of homemade browser games.

## Add a game

1. Create a folder for the game, such as `games/tic-tac-toe/`.
2. Add the game's `index.html`, CSS, and JavaScript inside that folder.
3. In the homepage `index.html`, replace one placeholder link with the game path, such as `games/tic-tac-toe/`.
4. Commit the changes to `main`.

## Preview locally

Because this is a plain HTML and CSS website, you can open `index.html` directly in a browser. For a small local server, run:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

