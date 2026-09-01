# Catbox Web Games

Source code for [catbox.party](https://catbox.party), a collection of homemade browser games.

## Make your own changes

You can edit files directly on GitHub by opening a file and selecting the pencil icon.

- `index.html` contains the homepage title, description, game boxes, and footer text.
- `styles.css` controls the colors, spacing, fonts, and responsive layout.
- `privacy/index.html` contains the privacy policy.

Commit changes to the `main` branch when you are ready to publish them. Once the Cloudflare connection is complete, every commit to `main` will be deployed automatically.

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

