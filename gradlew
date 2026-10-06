#!/usr/bin/env sh
# Lightweight wrapper launcher. It downloads the pinned Gradle distribution on first use.
set -eu
APP_HOME=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if ! command -v java >/dev/null 2>&1; then
    echo "A JDK 17 installation is required to build Apna Hisab." >&2
    exit 1
fi
GRADLE_VERSION="8.9"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"
DIST_ROOT="$GRADLE_USER_HOME/wrapper/dists/apna-hisab-gradle-$GRADLE_VERSION"
GRADLE_HOME="$DIST_ROOT/gradle-$GRADLE_VERSION"

if [ ! -x "$GRADLE_HOME/bin/gradle" ]; then
    mkdir -p "$DIST_ROOT"
    ZIP_FILE="$DIST_ROOT/gradle-$GRADLE_VERSION-bin.zip"
    if command -v curl >/dev/null 2>&1; then
        curl --fail --location --retry 3 --output "$ZIP_FILE" "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$ZIP_FILE" "https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip"
    else
        echo "Please install curl or wget to download Gradle $GRADLE_VERSION." >&2
        exit 1
    fi
    if command -v unzip >/dev/null 2>&1; then
        unzip -q -o "$ZIP_FILE" -d "$DIST_ROOT"
    else
        echo "Please install unzip to extract Gradle $GRADLE_VERSION." >&2
        exit 1
    fi
    rm -f "$ZIP_FILE"
fi

exec "$GRADLE_HOME/bin/gradle" -p "$APP_HOME" "$@"
