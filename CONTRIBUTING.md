# Contributing

JM/OS is Jincheng Ma's personal site, built and kept by one person, so
it isn't looking for features the way a shared project would. Still,
help is welcome:

- **Bugs:** something broken, slow, inaccessible or wrong on
  [www.majincheng.com](https://www.majincheng.com). Open an issue with
  the bug template.
- **Small fixes:** a typo, a broken link, a bug with an obvious cause.
  Send a pull request directly.
- **Ideas and larger changes:** open an issue first. The site has
  deliberate choices (the retro look and assets, what loads when, what
  the database allows) that are easier to talk through before code is
  written.
- **Security problems:** never in a public issue. See
  [SECURITY.md](SECURITY.md).

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setting up

You need Node 24 (the `engines` field in `package.json`). Then:

```bash
npm install
npm run dev        # http://localhost:4321
```

It runs without any accounts or keys: the social features use an
in-browser stand-in. The [README](README.md) covers the configuration
and the backend, and [AGENTS.md](AGENTS.md) with
[docs/agents/](docs/agents/) the conventions and how each part works
(written for coding agents, and just as useful to people).

## Making a change

1. Fork the repository and branch from `main`. Keep one logical change
   per pull request.
2. Run the checks for what you changed (AGENTS.md, Checking a change
   has the full table). For most changes:

   ```bash
   npm run format && npm run check && npm run lint && npm test
   npm run build && npm run test:smoke   # anything a visitor sees
   ```

   CI runs these on every pull request, with more (AGENTS.md says
   what).
3. Write everything in English, and follow the code around you; Biome
   formats it (`npm run format`), and CI checks that it did.
4. Open a pull request with the template filled in.

## Commits and pull request titles

Pull requests are squash-merged: each one becomes a single commit on
`main`, with the pull request's title as its subject and the branch's
commit messages as its body. So the title is a
[Conventional Commit](https://www.conventionalcommits.org/) subject,
which a check enforces:

```
fix: keep the Dock above a maximized window
feat(ipod): shuffle within a playlist
```

The types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore` and `revert`. Use the imperative mood,
no trailing period, and at most 72 characters.

If an AI tool helped write the change, credit it with a
`Co-Authored-By:` trailer at the end of the commit message.

## License

The code is under the GNU Affero General Public License v3.0 or later
([LICENSE](LICENSE)), and your contribution will be too. Jincheng's
personal content (the copy, the project write-ups, the photos) is not;
the README's License section lists it.
