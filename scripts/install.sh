#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
prefix=${PREFIX:-"$HOME/.local"}
build_dir="$project_dir/build"
wsf_environment="$HOME/.config/environment.d/wayland-scroll-factor.conf"
service_dropin_dir="$HOME/.config/systemd/user/org.gnome.Shell@user.service.d"
service_dropin="$service_dropin_dir/scroll-profiles.conf"
library="$prefix/lib/libscroll-profiles.so"
typelib_dir="$prefix/lib/girepository-1.0"

if [[ -f "$wsf_environment" ]] && grep -q 'libwsf_preload\.so' "$wsf_environment"; then
    printf '%s\n' \
        'Wayland Scroll Factor is still enabled.' \
        'Run "wsf disable" before installing Scroll Profiles.' >&2
    exit 1
fi

if [[ -f "$build_dir/meson-private/coredata.dat" ]]; then
    meson setup "$build_dir" "$project_dir" \
        --reconfigure \
        --prefix="$prefix" \
        --libdir=lib \
        --buildtype=release
else
    rm -rf -- "$build_dir"
    meson setup "$build_dir" "$project_dir" \
        --prefix="$prefix" \
        --libdir=lib \
        --buildtype=release
fi

meson compile -C "$build_dir"
meson test -C "$build_dir" --print-errorlogs
meson install -C "$build_dir"

mkdir -p "$service_dropin_dir"
cat >"$service_dropin" <<EOF
[Service]
Environment="LD_PRELOAD=$library"
Environment="SCROLL_PROFILES_PRELOAD=1"
Environment="GI_TYPELIB_PATH=$typelib_dir"
EOF

systemctl --user daemon-reload

printf '\n%s\n' \
    'Scroll Profiles is installed.' \
    'Log out and back in, then run:' \
    '  gnome-extensions enable scroll-profiles@nostalfinals'
