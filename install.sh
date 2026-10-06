#!/usr/bin/env bash
# Catavasia installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/Poxagronka/catavasia/main/install.sh | bash
#
# It builds the game from source and installs the global `catavasia` command.
# These are the same steps as the in-game self-update
# (server/src/update/updateRunner.ts): clone, npm ci, package, pack, install -g.
# CATAVASIA_REF picks another branch of the same repo (default: main).
set -euo pipefail

REPO_URL="https://github.com/Poxagronka/catavasia.git"
REF="${CATAVASIA_REF:-main}"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

# The whole body is one function, called on the last line. A partial download
# (curl | bash cut off) then defines nothing and runs nothing.
main() {
  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) fail "This script runs on macOS and Linux. On Windows, use WSL or the manual steps in docs/catavasia/INSTALL.md." ;;
  esac

  # 1. Prerequisites.
  command -v git >/dev/null 2>&1 ||
    fail "git is not installed. Install it (macOS: xcode-select --install, Linux: your package manager) and run this again."
  command -v node >/dev/null 2>&1 ||
    fail "Node.js is not installed. Install Node.js 20 or later (https://nodejs.org or nvm) and run this again."
  command -v npm >/dev/null 2>&1 ||
    fail "npm is not installed. It comes with Node.js: reinstall Node.js 20 or later."

  # 2. npm must be able to write its global folder. Check before the long build.
  NPM_PREFIX="$(npm prefix -g)"
  NPM_GLOBAL_DIR="$NPM_PREFIX/lib/node_modules"
  [ -d "$NPM_GLOBAL_DIR" ] || NPM_GLOBAL_DIR="$NPM_PREFIX"
  if [ ! -w "$NPM_GLOBAL_DIR" ]; then
    cat >&2 <<EOF
Error: npm cannot write its global folder: $NPM_GLOBAL_DIR
Do not use sudo. Pick one fix, then run this command again:
  - Use nvm (https://github.com/nvm-sh/nvm): nvm install 22
  - Or give npm a folder in your home:
      npm config set prefix "\$HOME/.npm-global"
      echo 'export PATH="\$HOME/.npm-global/bin:\$PATH"' >> ~/.profile
      export PATH="\$HOME/.npm-global/bin:\$PATH"
EOF
    exit 1
  fi

  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/catavasia-install.XXXXXX")"
  trap 'rm -rf "$WORK_DIR"' EXIT
  SRC="$WORK_DIR/src"

  # 3. Download the source.
  say "Downloading Catavasia ($REF)..."
  git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$SRC"
  cd "$SRC"

  # 4. Check the Node.js version against package.json "engines".
  NEED_MAJOR="$(node -p "(require('./package.json').engines.node.match(/\\d+/) || ['0'])[0]")"
  HAVE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$HAVE_MAJOR" -lt "$NEED_MAJOR" ]; then
    fail "Node.js $NEED_MAJOR or later is necessary. You have $(node -v). Update Node.js (for example: nvm install 22) and run this again."
  fi

  # 5. Build and install. The same commands as the in-game update.
  say "Installing dependencies (a few minutes)..."
  npm ci --include=dev --no-audit --no-fund --loglevel=error
  say "Building..."
  npm run package --silent >"$WORK_DIR/build.log" 2>&1 ||
    {
      tail -n 40 "$WORK_DIR/build.log" >&2
      fail "The build failed. The last lines of the build log are above."
    }
  say "Packing..."
  TGZ="$(npm pack --ignore-scripts --silent | tail -n 1)"
  [ -f "$TGZ" ] || fail "npm pack did not make a package file."
  say "Installing the catavasia command..."
  npm install -g --no-audit --no-fund --loglevel=error "$SRC/$TGZ"

  VERSION="$(node -p "require('./package.json').version")"
  BIN_DIR="$NPM_PREFIX/bin"

  cat <<EOF

Catavasia $VERSION is installed.

Start it: double-click the catavasia launcher on your Desktop,
or run: catavasia
The office opens in your browser at http://127.0.0.1:3100.
No launcher? Run: catavasia shortcut

Update: click Update when the game shows a new version,
or run the same install command again.
EOF

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) printf '\nNote: %s is not in your PATH. Add it to start catavasia by name.\n' "$BIN_DIR" ;;
  esac
}

main "$@"
