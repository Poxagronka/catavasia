# Install Catavasia

This guide installs Catavasia, starts it, updates it and removes it. It also lists the fixes for common problems.

Install catavasia from npm. As an alternative, the installer script builds it from GitHub `main`.

## Contents

- [Quick install](#quick-install)
- [Install from source](#install-from-source)
- [Requirements](#requirements)
- [What the installer does](#what-the-installer-does)
- [First start](#first-start)
- [Manual install](#manual-install)
- [Windows](#windows)
- [Update](#update)
- [Uninstall](#uninstall)
- [Where Catavasia keeps its data](#where-catavasia-keeps-its-data)
- [Troubleshooting](#troubleshooting)
- [Feedback and issues](#feedback-and-issues)

## Quick install

Run this line in a terminal (Node.js 20 or later):

```bash
npm install -g catavasia
```

The install puts a **catavasia** launcher on your Desktop. Double-click it, or run `catavasia` in a terminal. The office opens in your browser at `http://127.0.0.1:3100`.

| System  | Launcher                                                                                  |
| ------- | ----------------------------------------------------------------------------------------- |
| macOS   | `~/Desktop/catavasia.command`                                                             |
| Linux   | `~/.local/share/applications/catavasia.desktop` (the app menu), and a copy on `~/Desktop` |
| Windows | `Desktop\catavasia.cmd`                                                                   |

`npm install -g --ignore-scripts` makes no launcher. Run `catavasia shortcut` to make it. The command is safe to run again.

To try catavasia once without an install, run `npx catavasia` in your project folder.

## Install from source

On macOS or Linux, this script builds catavasia from GitHub `main` and installs the `catavasia` command:

```bash
curl -fsSL https://raw.githubusercontent.com/Poxagronka/catavasia/main/install.sh | bash
```

The script takes a few minutes. At the end it prints `Catavasia <version> is installed.` Use it to get changes that are on `main` but not yet on npm.

To read the script before you run it, open [install.sh](../../install.sh). It has about 100 lines.

## Requirements

| What                                                          | Version                           | Why                                                                                                              |
| ------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| macOS or Linux                                                | any current version               | The installer and the in-game update run there. On Windows, use WSL2.                                            |
| [Node.js](https://nodejs.org)                                 | 20 or later (22 recommended)      | Runs the server. The installer reads the minimum from `package.json`.                                            |
| npm                                                           | comes with Node.js                | Builds and installs the package.                                                                                 |
| git                                                           | any                               | Downloads the source (installer only). The cat team uses git worktrees.                                          |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | installed and logged in           | The cats run `claude` to do your tasks. Without it, you can still watch the office and your own Claude sessions. |
| A browser                                                     | current Chrome, Firefox or Safari | Shows the office.                                                                                                |

About 500 MB of free disk space is necessary during the source build. The installer deletes the build folder when it ends.

## What the installer does

The installer runs the same steps as the in-game update (`server/src/update/updateRunner.ts`). So the first install and every later update give the same result.

1. It checks that `git`, `node` and `npm` are installed.
2. It checks that npm can write its global folder (`npm prefix -g`). It does not use `sudo`. When npm cannot write there, it stops and prints the fix.
3. It clones the `main` branch into a temporary folder.
4. It checks the Node.js version against `engines.node` in `package.json`.
5. It runs `npm ci --include=dev`, `npm run package` and `npm pack --ignore-scripts`.
6. It runs `npm install -g` with the packed `.tgz` file. This adds the `catavasia` command and the Desktop launcher.
7. It deletes the temporary folder and prints how to start and update.

To install another branch of this repository, set `CATAVASIA_REF`:

```bash
curl -fsSL https://raw.githubusercontent.com/Poxagronka/catavasia/main/install.sh | CATAVASIA_REF=my-branch bash
```

## First start

1. Double-click the Desktop launcher. Or go to the project folder that your Claude Code sessions use and run `catavasia`. Catavasia shows the sessions of the folder it starts in. The launcher starts in your home folder.
2. Catavasia starts on port 3100 and opens the office in your default browser. It also prints the URL:

   ```text
   catavasia server running at http://127.0.0.1:3100/?token=...
   ```

3. The `?token=` part gives this browser tab edit rights. The page saves the token and removes it from the address bar.
4. The first time, the office asks for approval to add hooks to `~/.claude/settings.json`. Hooks let the cats react at once to your Claude Code sessions. You can say no. Then Catavasia reads the session files instead, with a short delay.

Useful options:

```bash
catavasia --port 3200               # another port (default: 3100)
catavasia --no-open                 # do not open the browser, only print the URL
catavasia --host 127.0.0.1          # the bind address (this is the default)
catavasia shortcut                  # make the Desktop launcher again
catavasia shortcut --remove         # remove the Desktop launcher
catavasia --help                    # all options
```

When catavasia already runs on the port, a second `catavasia` (or a second double-click) only opens its tab and exits. When another program holds port 3100, catavasia starts on a free port and prints a note. `CATAVASIA_PORT=<n>` changes the default port.

Stop the server with **Ctrl+C**.

The token stays the same across restarts. It lives in `~/.pixel-agents/auth-token`. Keep the URL private: anyone who has it can edit your office and start tasks.

## Manual install

Use these steps when you do not want to pipe a script into `bash`. They are the same steps that the installer runs.

```bash
git clone --depth 1 https://github.com/Poxagronka/catavasia.git
cd catavasia
npm ci --include=dev
npm run package
npm pack --ignore-scripts
npm install -g ./catavasia-*.tgz
cd .. && rm -rf catavasia
```

## Windows

Use WSL2. Install Ubuntu from the Microsoft Store, open the Ubuntu terminal and run the [quick install](#quick-install) line there. Open the printed URL in your Windows browser.

The [manual install](#manual-install) commands are plain `git` and `npm` commands, so they can also work in native Windows PowerShell. We did not test this. In native Windows, the in-game update does not work (it is for macOS and Linux only). To update, run the manual steps again.

## Update

**In the game.** Catavasia checks this repository for a new version when it starts and every 6 hours. When there is one, a panel shows "New version X is available" with **Update**, **Later** and **What's new**.

- **Update** builds and installs the new version, then restarts the server. The open tab reloads by itself.
- The game does not update while a cat works on a task. It tells you which tasks to wait for.
- **Settings → Check for updates** checks now. **Settings → Check for updates automatically** turns the checks off.
- The build log is in `~/.pixel-agents/update/update-<time>.log`.

**From the terminal.** Run `npm install -g catavasia@latest` to get the newest npm release. Each merge to `main` publishes a new npm release automatically. Or run the [installer](#install-from-source) line again to build the newest `main`. Your office, cats and tasks stay.

## Uninstall

1. Remove the Catavasia hooks from `~/.claude/settings.json`. Do one of these:
   - In the game, turn off **Settings → Instant Detection (Hooks)**.
   - Or run: `node "$(npm root -g)/catavasia/dist/uninstall.js"`. This command also removes the Desktop launcher.
   - To remove only the launcher, run `catavasia shortcut --remove`.
2. Remove the command. npm 7 and later run no uninstall scripts, so do step 1 first:

   ```bash
   npm uninstall -g catavasia
   ```

3. Optional: remove your office data. This deletes your layout, cats, prompts, tasks and token.

   ```bash
   rm -rf ~/.pixel-agents
   ```

   Do not do this step if you also use the upstream Pixel Agents extension. It uses the same folder.

Team tasks also leave git branches named `task/<id>` in your project repositories. Their worktrees are in `~/.pixel-agents/worktrees/`. After you delete that folder, run `git worktree prune` in each project. Remove old branches with `git branch -D` when you do not need them.

## Where Catavasia keeps its data

All files are in `~/.pixel-agents/`:

| Path                             | What                                                    |
| -------------------------------- | ------------------------------------------------------- |
| `layout.json`                    | The office layout and the pet cats                      |
| `cats.json`                      | The agent cats and the hierarchy                        |
| `prompts/`                       | One prompt file per cat, in a local git repository      |
| `tasks.json`, `flows/<task id>/` | The task board and the event log of each team task      |
| `worktrees/<task id>/`           | The git worktree of each task                           |
| `auth-token`                     | The server token (mode 0600)                            |
| `update/`                        | The update logs                                         |
| `backups/<time>/`                | The files that **Settings → Reset everything** replaced |
| `servers/`                       | One file per running server                             |

## Troubleshooting

**`catavasia: command not found`.** The npm global `bin` folder is not in your `PATH`. Run `npm prefix -g`, then add `<that folder>/bin` to `PATH` in your shell profile. Open a new terminal.

**`EACCES` or "npm cannot write its global folder".** npm installs global packages in a system folder. Do not use `sudo`. Use one of these fixes:

- Install Node.js with [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`. nvm keeps global packages in your home folder.
- Or give npm a folder in your home:

  ```bash
  npm config set prefix "$HOME/.npm-global"
  echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.profile
  export PATH="$HOME/.npm-global/bin:$PATH"
  ```

**"Node.js 20 or later is necessary".** Update Node.js. With nvm: `nvm install 22 && nvm use 22`.

**The build fails.** The installer shows the last 40 lines of the build log. Check the Node.js version first. Then send a [bug report](https://github.com/Poxagronka/catavasia/issues/new?template=bug_report.yml) with those lines.

**"Port N is busy. Use --port <other> or stop the other process."** Another program uses the port that you gave with `--port`. Start `catavasia` without `--port` (it uses 3100, or a free port when 3100 is busy), or pick another port. To see which program holds the port, run `lsof -iTCP:<port> -sTCP:LISTEN`.

**"Open the office with `catavasia` to get edit rights".** The tab has no valid token, so it can only watch. The fix is: open the full URL that `catavasia` prints, with its `?token=` part. After that, the tab keeps the token after a reload. The browser saves the token per port, so use a fixed `--port` to keep it across server restarts.

**I want a new token.** Stop the server, delete `~/.pixel-agents/auth-token` and start `catavasia` again. Open the new URL.

**The cats do not do my tasks.** Check that `claude --version` works in the same terminal, and that you are logged in to Claude Code. The cats run `claude` in the folder that you give the task.

**My Claude sessions do not show as cats.** By default the office shows only your own cats. Turn on **Settings → Show Guests** to show other Claude sessions of this project. **Settings → Watch All Sessions** adds the sessions of all projects. **Settings → Debug View** shows the connection state.

**The update failed.** The update panel shows the failed step and the log path. The running server stays as it was. Read `~/.pixel-agents/update/update-<time>.log`. When the new version does not start, read `~/.pixel-agents/update/restart.log` and start `catavasia` by hand.

## Feedback and issues

- [Report a bug](https://github.com/Poxagronka/catavasia/issues/new?template=bug_report.yml)
- [Suggest a feature](https://github.com/Poxagronka/catavasia/issues/new?template=feature_request.yml)
- [Send feedback](https://github.com/Poxagronka/catavasia/issues/new?template=feedback.yml)

Remove tokens, user names and private paths from logs and screenshots before you post them.
