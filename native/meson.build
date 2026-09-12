glib_dep = dependency('glib-2.0')
libinput_dep = dependency('libinput')
dl_dep = meson.get_compiler('c').find_library('dl')
threads_dep = dependency('threads')

scroll_profiles_library = shared_library(
  'scroll-profiles',
  ['scroll-profiles.c'],
  dependencies: [glib_dep, libinput_dep, dl_dep, threads_dep],
  gnu_symbol_visibility: 'hidden',
  install: true,
  install_dir: get_option('libdir'),
)

gnome.generate_gir(
  scroll_profiles_library,
  sources: ['scroll-profiles.h'],
  namespace: 'ScrollProfiles',
  nsversion: '1.0',
  symbol_prefix: 'scroll_profiles',
  identifier_prefix: 'ScrollProfiles',
  includes: ['GLib-2.0'],
  dependencies: [glib_dep],
  install: true,
  install_dir_gir: get_option('datadir') / 'gir-1.0',
  install_dir_typelib: get_option('libdir') / 'girepository-1.0',
  extra_args: ['--warn-all'],
)
