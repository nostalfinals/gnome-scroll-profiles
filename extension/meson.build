extension_uuid = 'scroll-profiles@nostalfinals'
extension_dir = get_option('datadir') / 'gnome-shell' / 'extensions' / extension_uuid
schema_dir = meson.current_source_dir() / 'schemas'

install_data(
  ['extension.js', 'prefs.js', 'metadata.json'],
  install_dir: extension_dir,
)

install_data(
  'schemas/org.gnome.shell.extensions.scroll-profiles.gschema.xml',
  install_dir: extension_dir / 'schemas',
)

compiled_schema = custom_target(
  'extension-schema',
  input: 'schemas/org.gnome.shell.extensions.scroll-profiles.gschema.xml',
  output: 'gschemas.compiled',
  command: [
    find_program('glib-compile-schemas'),
    '--strict',
    '--targetdir', '@OUTDIR@',
    schema_dir,
  ],
  build_by_default: true,
  install: true,
  install_dir: extension_dir / 'schemas',
)
