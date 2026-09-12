fake_input = shared_library(
  'fake-input',
  'fake-input.c',
  dependencies: [libinput_dep],
)

hook_test = executable(
  'hook-test',
  'hook-test.c',
  link_with: fake_input,
  dependencies: [libinput_dep, dl_dep],
)

hook_test_env = environment()
hook_test_env.set('LD_PRELOAD', scroll_profiles_library.full_path())
hook_test_env.set('SCROLL_PROFILES_PRELOAD', '1')

test(
  'native hook and live factors',
  hook_test,
  env: hook_test_env,
  depends: scroll_profiles_library,
)
