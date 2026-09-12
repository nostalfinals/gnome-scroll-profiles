#!/usr/bin/env bash
set -euo pipefail

prefix=${PREFIX:-"$HOME/.local"}
uuid='scroll-profiles@nostalfinals'
extension_dir="$prefix/share/gnome-shell/extensions/$uuid"
service_dropin="$HOME/.config/systemd/user/org.gnome.Shell@user.service.d/scroll-profiles.conf"

if gnome-extensions info "$uuid" >/dev/null 2>&1; then
    gnome-extensions disable "$uuid" || true
fi

if [[ -d "$extension_dir/schemas" ]]; then
    GSETTINGS_SCHEMA_DIR="$extension_dir/schemas" \
        gsettings reset-recursively org.gnome.shell.extensions.scroll-profiles || true
fi

rm -rf -- "$extension_dir"
rm -f -- \
    "$prefix/lib/libscroll-profiles.so" \
    "$prefix/lib/girepository-1.0/ScrollProfiles-1.0.typelib" \
    "$prefix/share/gir-1.0/ScrollProfiles-1.0.gir" \
    "$service_dropin"
rmdir --ignore-fail-on-non-empty \
    "$HOME/.config/systemd/user/org.gnome.Shell@user.service.d" 2>/dev/null || true
systemctl --user daemon-reload || true

printf '%s\n' \
    'Scroll Profiles was removed.' \
    'Log out and back in to unload the native library.'
