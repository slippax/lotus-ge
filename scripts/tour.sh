#!/bin/bash
# ---------------------------------------------------------------------------
# The guided tour. Run the server first (npm run dev), then:  npm run tour
#
# Every step prints the curl command, runs it, and says what to notice.
# Read the terminal, not this file.
#
# Two of the steps need the server started in a failure mode. The script
# detects which mode the server is in and tells you what it can and can't
# show - it never claims to have demonstrated a failure path it didn't run.
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"

say()  { printf '\n\033[1;36m%s\033[0m\n' "$1"; }
note() { printf '\033[0;90m%s\033[0m\n' "$1"; }
run()  { printf '\033[0;33m$ %s\033[0m\n' "$1"; eval "$1"; printf '\n'; }
rule() { printf '\033[0;90m%s\033[0m\n' "-------------------------------------------------------------"; }

# Never let a curl hang forever.
#
#   --connect-timeout 3   nothing listening -> fail in 3s, not 2 minutes
#   --max-time 45         connected but no answer -> give up. 45 and not 10
#                         because UPSTREAM_FAIL=slow deliberately sleeps 30s,
#                         and that mode has to stay demonstrable.
#
# The case this exists for: a dev server SUSPENDED with Ctrl-Z (rather than
# killed with Ctrl-C) keeps the port bound. The kernel accepts your connection
# and the stopped process never reads it, so curl waits forever. Without a
# timeout the tour just hangs with no output and no explanation.
CT="--connect-timeout 3 --max-time 45"

# --- Is anything listening, and is it actually answering? -------------------
curl -s $CT -o /dev/null "$BASE/api/v1/dip-detection" 2>/dev/null
case $? in
  0) ;;
  7) echo "Nothing is listening at $BASE."
     echo "Run 'npm run dev' in another terminal first."
     echo "(Override the target with BASE=http://localhost:3001 npm run tour)"
     exit 1 ;;
  28) echo "$BASE accepted the connection but never answered (timed out)."
      echo
      echo "Usually this means the dev server is SUSPENDED, not stopped -"
      echo "Ctrl-Z leaves the port bound while the process is frozen."
      echo "Check with:   lsof -nP -iTCP:3000 -sTCP:LISTEN"
      echo "Resume it with 'fg', or kill it and start a fresh 'npm run dev'."
      exit 1 ;;
  *) echo "Couldn't reach $BASE (curl exit $?)."
     exit 1 ;;
esac

# --- Which mode is the server in? -------------------------------------------
# Probe once and branch. UPSTREAM_FAIL is read from process.env inside
# upstreamFetch(), so it belongs to the SERVER process, not to this script.
PROBE=$(curl -s $CT "$BASE/api/v1/dip-detection")
case "$PROBE" in
  *github_unavailable*) MODE="ratelimit" ;;
  *github_malformed*)   MODE="garbage"   ;;
  *)                    MODE="normal"    ;;
esac

printf '\n\033[1;35m  Lotus GE - API tour\033[0m\n'
note "  target: $BASE"
note "  server mode: $MODE"

# ===========================================================================
#  HAPPY PATH
# ===========================================================================
if [ "$MODE" = "normal" ]; then

rule
say "1. The response envelope - and what ISN'T in it"
note "Watch the body: {\"data\":[...], \"updated\":..., \"count\":N}. No \"success\" field."
note "The status line already said it worked. A body field repeating that is a"
note "SECOND SOURCE OF TRUTH, and two sources of truth eventually disagree."
note "Also in the headers: x-request-id. Every response carries one, so a bug"
note "report can name the exact request in the logs."
run "curl -i -s $CT $BASE/api/v1/dip-detection | head -14"

rule
say "2. Versioning, live - the same data in the OLD shape"
note "Both routes are served by the same deploy, right now. This is what a version"
note "buys you: the old contract keeps working while the new one is the good one."
run "curl -s $CT $BASE/api/osrs/dip-detection | head -c 420; echo"
note ""
note "Notice in the OLD shape: \"success\":true, and volume24hTotal:1000,"
note "volume1hTotal:100, volume5mTotal:10, icon:\"\", id:0."
note "Those volume numbers are HARDCODED PLACEHOLDERS that were being served as"
note "analysis. v1 dropped them rather than inventing a calculation to justify"
note "them. Compare against step 1 - the v1 body has none of those fields."

rule
say "3. A real 404 - asking for an item that doesn't exist"
note "The important thing is what this ISN'T: an empty array with a 200."
note "\"I looked and there is nothing\" and \"that thing does not exist\" are"
note "different answers, and a client has to be able to tell them apart."
run "curl -s $CT -w '\\n[HTTP %{http_code}]\\n' $BASE/api/v1/items/999999/history"

rule
say "4. A 422 - the parameter is well-formed but not valid"
note "422, not 400. The request parsed fine; the VALUE is wrong."
note "Notice the error names the field AND lists the legal values, so a client"
note "never has to guess. And 'code' is machine-readable - clients branch on"
note "invalid_range, never on the English in 'message'."
run "curl -s $CT -w '\\n[HTTP %{http_code}]\\n' '$BASE/api/v1/items/536/history?range=banana'"

rule
say "5. Same envelope, different failure - a bad id"
note "One error shape for the whole API: {error:{type,code,message,requestId}}."
note "One shape to learn, and it's identical whether the problem is yours or ours."
run "curl -s $CT -w '\\n[HTTP %{http_code}]\\n' $BASE/api/v1/items/abc/history"

rule
say "6. A collection that's legitimately empty"
note "Name lookups return {items:[...]}. An empty array HERE is a real answer -"
note "it means 'no item by that name', which is a successful search with no hits."
note "That's exactly why step 3 had to be a 404 instead of this."
run "curl -s $CT -w '\\n[HTTP %{http_code}]\\n' '$BASE/api/v1/items?name=Dragon%20bones'"
run "curl -s $CT -w '\\n[HTTP %{http_code}]\\n' '$BASE/api/v1/items?name=Not%20A%20Real%20Item'"

rule
say "7. Cache-Control - what each directive actually buys"
run "curl -s $CT -D - -o /dev/null $BASE/api/v1/dip-detection | grep -i '^cache-control'"
note ""
note "  s-maxage=60             the shared CDN cache holds it for 60s. The collector"
note "                          writes every ~5 min, so 60s is fresher than the data"
note "                          ever is - and it turns 'six GitHub calls per VISITOR'"
note "                          into 'six GitHub calls per MINUTE'."
note "  max-age=0               the browser revalidates every time, so a reload always"
note "                          reflects the shared cache instead of a private guess."
note "  stale-while-revalidate  once the 60s lapse, the next visitor gets the slightly"
note "            =300          stale copy INSTANTLY while the refresh happens behind"
note "                          them. Nobody ever waits on GitHub."

rule
say "8. Now go watch it break"
note "The two most important steps in this tour can't run against a healthy server."
note "In your dev terminal, Ctrl-C and restart with a failure mode, then re-run:"
note ""
note "    UPSTREAM_FAIL=ratelimit npm run dev     # then: npm run tour"
note "    UPSTREAM_FAIL=garbage   npm run dev     # then: npm run tour"
note ""
note "You cannot trust a failure path you have never watched run."

# ===========================================================================
#  FAILURE PATHS
# ===========================================================================
else

rule
say "THE BUG THIS API USED TO HAVE (mode: $MODE)"
if [ "$MODE" = "ratelimit" ]; then
  note "GitHub is refusing us - 403, rate limited. The trap: fetch() does NOT throw"
  note "on a 403. It resolves normally, like any other response. So without an"
  note "explicit response.ok check, execution carried straight on."
else
  note "GitHub answered 200 - with a body that isn't JSON. A proxy error page, a"
  note "truncated response. The trap: the status was FINE, so a response.ok check"
  note "passes cleanly and .json() is what blows up, one step later."
fi
note ""
note "Either way the old code ended in the same place: an EMPTY ARRAY WITH A 200."
note "'No dips right now' - indistinguishable from a calm market, and the exact"
note "opposite of the truth, which is 'we could not ask'."
note ""
note "Here is what it does now instead:"
run "curl -i -s $CT $BASE/api/v1/dip-detection | head -12"

rule
if [ "$MODE" = "ratelimit" ]; then
  say "What to notice - ratelimit"
  note "  503                  not 200. An upstream failure is OUR failure to serve,"
  note "                       and 5xx is the class that means 'try again later'."
  note "  Retry-After: 30      a machine-readable instruction. A client that retries"
  note "                       on a schedule doesn't have to guess or hammer us."
  note "  code: github_unavailable   the cause, branchable in code."
  note "  NO Cache-Control     errors are not cached. Caching a 503 for 60s would"
  note "                       turn a blip into a minute of guaranteed downtime."
else
  say "What to notice - garbage"
  note "  503                  the upstream answered, but unusably. Still their"
  note "                       problem, still not a 200, still not our bug to own."
  note "  Retry-After: 30      same as the ratelimit case - every 503 here carries"
  note "                       one, because every one of them is 'try again later'."
  note "  code: github_malformed   distinct from github_unavailable, because"
  note "                       'they answered with nonsense' and 'they refused to"
  note "                       answer' are different operational problems. One is a"
  note "                       quota you can raise; the other is a broken upstream"
  note "                       you can only wait out. You want them apart in logs."
fi

rule
say "The other side of it"
note "Restart the server without UPSTREAM_FAIL and run the tour again to see the"
note "happy path, the versioning pair, and the cache headers."
note ""
note "    npm run dev     # then: npm run tour"

fi

rule
printf '\n\033[1;35m  end of tour\033[0m\n\n'
