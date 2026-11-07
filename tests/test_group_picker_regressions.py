from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class GroupPickerRegressionTest(unittest.TestCase):
    def test_both_frontends_use_shared_group_directory_proxy(self):
        expected = "https://kgeu-telegram-miniapp.2vkv544dmd.workers.dev/api/groups?year=2026-2027"
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn(expected, source)
                self.assertNotIn(
                    "https://kabinet.kgeu.ru/api/raspGrouplist?year=2026-2027",
                    source,
                )

    def test_worker_has_public_read_only_group_directory_route(self):
        source = (ROOT / "backend" / "worker.js").read_text(encoding="utf-8")
        self.assertIn("url.pathname === '/api/groups' && request.method === 'GET'", source)
        self.assertIn("https://kabinet.kgeu.ru/api/raspGrouplist?year=", source)
        self.assertIn("group_directory_invalid_response", source)
        self.assertIn("group_directory_unavailable", source)

    def test_group_search_selection_waits_for_explicit_save(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("let selectedDirectoryGroup = null;", source)
                self.assertIn("await switchGroup(id, name, meta);", source)
                self.assertIn("Открываем группу…", source)
                self.assertNotIn("switchGroup(g.id,g.name,g).catch(function(){});", source)

    def test_empty_schedule_on_probe_date_does_not_reject_group(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("An empty schedule for one date does not mean the group is invalid.", source)
                self.assertNotIn(
                    "if (!probe.groupInfo && !probe.lessons.length) {\n        throw new Error('group not found');",
                    source,
                )

    def test_both_frontends_bound_schedule_and_group_directory_requests(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(frontend=relative):
                self.assertIn("async function fetchWithTimeout(url, options, timeoutMs)", source)
                self.assertIn("fetchWithTimeout(API + '?' + qs, null, 12000)", source)
                self.assertIn("fetchWithTimeout(GROUP_DIRECTORY_API, null, 12000)", source)

    def test_fetch_timeout_helper_aborts_stalled_request_in_both_frontends(self):
        for relative in ("index.html", "apps/vk/index.html"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            marker = "async function fetchWithTimeout(url, options, timeoutMs)"
            start = source.index(marker)
            opening = source.index("{", start)
            depth = 0
            end = None
            for index in range(opening, len(source)):
                if source[index] == "{":
                    depth += 1
                elif source[index] == "}":
                    depth -= 1
                    if depth == 0:
                        end = index + 1
                        break
            self.assertIsNotNone(end, relative + ": helper body is not balanced")
            helper = source[start:end]
            script = helper + r"""
(async function () {
  let signal = null;
  global.fetch = function (_url, options) {
    signal = options && options.signal;
    return new Promise(function () {});
  };
  let timedOut = false;
  try {
    await fetchWithTimeout('/slow', null, 10);
  } catch (error) {
    timedOut = error && error.message === 'request_timeout';
  }
  if (!timedOut) throw new Error('stalled request did not time out');
  if (!signal || !signal.aborted) throw new Error('timed-out request was not aborted');
  global.fetch = async function () { return { ok: true }; };
  const response = await fetchWithTimeout('/fast', null, 100);
  if (!response.ok) throw new Error('successful request was not returned');
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
"""
            result = subprocess.run(
                ["node", "-e", script],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(
                result.returncode,
                0,
                relative + ": " + result.stdout + result.stderr,
            )


if __name__ == "__main__":
    unittest.main()
