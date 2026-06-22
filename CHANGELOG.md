# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.20.0](https://github.com/LucasSantana-Dev/Lucky/compare/v2.19.0...v2.20.0) (2026-06-22)


### Features

* **moderation:** move a message to another channel via right-click ([#1516](https://github.com/LucasSantana-Dev/Lucky/issues/1516)) ([9822893](https://github.com/LucasSantana-Dev/Lucky/commit/98228930177479a078016c1c20e1ba43d393b7fd))


### Bug Fixes

* **release:** set pull-request-title-pattern to include version ([#1514](https://github.com/LucasSantana-Dev/Lucky/issues/1514)) ([cde12ec](https://github.com/LucasSantana-Dev/Lucky/commit/cde12ecc9881b1ca496fb0112e98d3bae2910c8e))

## [2.19.0](https://github.com/LucasSantana-Dev/Lucky/compare/v2.18.0...v2.19.0) (2026-06-20)


### Features

* **logs:** async context propagation, discord alerts, noise filtering ([#1510](https://github.com/LucasSantana-Dev/Lucky/issues/1510)) ([a952c54](https://github.com/LucasSantana-Dev/Lucky/commit/a952c5400518f29c650abb286fada80caf34f2cd))
* **twitch:** follower and subscriber role sync ([#1509](https://github.com/LucasSantana-Dev/Lucky/issues/1509)) ([d353bc0](https://github.com/LucasSantana-Dev/Lucky/commit/d353bc068614da2310bf50393a3b321842bb8044))


### Bug Fixes

* **automod:** remove dead warn/mute/kick/ban switch cases ([#1511](https://github.com/LucasSantana-Dev/Lucky/issues/1511)) ([8ec8ed7](https://github.com/LucasSantana-Dev/Lucky/commit/8ec8ed76cbba1e30442fe17c9f15aa9ccf494dff))

## [2.18.0](https://github.com/LucasSantana-Dev/Lucky/compare/v2.17.0...v2.18.0) (2026-06-19)


### Features

* **autoplay:** add implicit-dislike-penalty signal ([#1374](https://github.com/LucasSantana-Dev/Lucky/issues/1374)) ([593c0ad](https://github.com/LucasSantana-Dev/Lucky/commit/593c0ada5b732b4a48d63204c8e849c4b5057677))
* **autoplay:** add recency-decay signal for queue diversity ([#1376](https://github.com/LucasSantana-Dev/Lucky/issues/1376)) ([b85e2a0](https://github.com/LucasSantana-Dev/Lucky/commit/b85e2a0f5d79efd04590d17db58faee5f5a50d38))
* **autoplay:** boost candidates for frequently replayed tracks ([#1370](https://github.com/LucasSantana-Dev/Lucky/issues/1370)) ([215edea](https://github.com/LucasSantana-Dev/Lucky/commit/215edea22b8e99ab114f3450323a5f5de61ce6fb))
* **autoplay:** guild opt-out toggle for sertanejo veto ([#1087](https://github.com/LucasSantana-Dev/Lucky/issues/1087)) ([#1373](https://github.com/LucasSantana-Dev/Lucky/issues/1373)) ([6cb5588](https://github.com/LucasSantana-Dev/Lucky/commit/6cb55883f850aca68f4a6d5c2d5a3e5b492df8d5))
* **autoplay:** instrument outcome eval to disambiguate [#1275](https://github.com/LucasSantana-Dev/Lucky/issues/1275) ([#1491](https://github.com/LucasSantana-Dev/Lucky/issues/1491)) ([1921ab5](https://github.com/LucasSantana-Dev/Lucky/commit/1921ab58ac8de1826fe73a931a02a9a5bf9c7541))
* **backend:** add zod validation to artists and toggles routes ([#1189](https://github.com/LucasSantana-Dev/Lucky/issues/1189)) ([#1334](https://github.com/LucasSantana-Dev/Lucky/issues/1334)) ([b59fb35](https://github.com/LucasSantana-Dev/Lucky/commit/b59fb35244d9f1712d0730035c154ba471e34544))
* **backend:** dedup key for support-report intake ([#1319](https://github.com/LucasSantana-Dev/Lucky/issues/1319)) ([#1328](https://github.com/LucasSantana-Dev/Lucky/issues/1328)) ([4d95307](https://github.com/LucasSantana-Dev/Lucky/commit/4d9530762e37c97440e2e6a6957886ff41fcc1b6))
* **backend:** move session store from Redis to Postgres ([#1111](https://github.com/LucasSantana-Dev/Lucky/issues/1111)) ([#1396](https://github.com/LucasSantana-Dev/Lucky/issues/1396)) ([ff5e0b6](https://github.com/LucasSantana-Dev/Lucky/commit/ff5e0b684aa369a208a3e01d9c9a8c4cc53e4308))
* **backend:** request-id correlation middleware for [#1286](https://github.com/LucasSantana-Dev/Lucky/issues/1286) ([#1417](https://github.com/LucasSantana-Dev/Lucky/issues/1417)) ([671ed4c](https://github.com/LucasSantana-Dev/Lucky/commit/671ed4c90471670f68346b493eade85d55a92ee9))
* **bot:** instrument serversetup criativaria invocations ([#1288](https://github.com/LucasSantana-Dev/Lucky/issues/1288)) ([#1390](https://github.com/LucasSantana-Dev/Lucky/issues/1390)) ([c37f021](https://github.com/LucasSantana-Dev/Lucky/commit/c37f021f3c28a13a6a58ed2529dcc5e3269892b1))
* **bot:** utility join-onboarding message + in-bot growth adr ([#1506](https://github.com/LucasSantana-Dev/Lucky/issues/1506)) ([0a23775](https://github.com/LucasSantana-Dev/Lucky/commit/0a23775cdb458479e0e1b23ad1e42679d6036d57))
* **db:** add check constraints on guild_settings bounds ([#1124](https://github.com/LucasSantana-Dev/Lucky/issues/1124)) ([#1338](https://github.com/LucasSantana-Dev/Lucky/issues/1338)) ([a7c7400](https://github.com/LucasSantana-Dev/Lucky/commit/a7c74007bbb0df43e45e88de52971e3858ee729a))
* growth surfaces — /invite, landing SEO + CTA, guild telemetry ([#1494](https://github.com/LucasSantana-Dev/Lucky/issues/1494)) ([205876d](https://github.com/LucasSantana-Dev/Lucky/commit/205876d4ad9ba415840abc4207ca9ac98a99e7f4))
* **music:** add previous-track command end to end ([#1239](https://github.com/LucasSantana-Dev/Lucky/issues/1239)) ([#1347](https://github.com/LucasSantana-Dev/Lucky/issues/1347)) ([7771167](https://github.com/LucasSantana-Dev/Lucky/commit/7771167e7cc1534c561d6bad3cfbd2bcf85e261f))
* **observability:** alert on redis control publish failures ([#1401](https://github.com/LucasSantana-Dev/Lucky/issues/1401)) ([6e46cd7](https://github.com/LucasSantana-Dev/Lucky/commit/6e46cd7ab193dedbff4a7b62ac0c6060489a4607))
* **security:** add security headers + csp report-only ([#1283](https://github.com/LucasSantana-Dev/Lucky/issues/1283)) ([#1315](https://github.com/LucasSantana-Dev/Lucky/issues/1315)) ([7413a1c](https://github.com/LucasSantana-Dev/Lucky/commit/7413a1cebe733cd62f583ed197cd3bba50428e82))
* **security:** collect CSP violations via report-uri sink ([#1283](https://github.com/LucasSantana-Dev/Lucky/issues/1283)) ([#1415](https://github.com/LucasSantana-Dev/Lucky/issues/1415)) ([6f68aa3](https://github.com/LucasSantana-Dev/Lucky/commit/6f68aa31b8d9a9582e36de85c77e32d58d8adfd5))
* skip-reason telemetry via emoji reactions on now-playing ([#1377](https://github.com/LucasSantana-Dev/Lucky/issues/1377)) ([5b1959f](https://github.com/LucasSantana-Dev/Lucky/commit/5b1959fd96057c396baf17f9929e6a32f9737eed))


### Bug Fixes

* add timeouts to unbounded external fetch calls ([#1333](https://github.com/LucasSantana-Dev/Lucky/issues/1333)) ([38dde55](https://github.com/LucasSantana-Dev/Lucky/commit/38dde55fb8631185fed7e3e025d94362fef68e13))
* **auth:** log session lookup failures in optional auth ([#1286](https://github.com/LucasSantana-Dev/Lucky/issues/1286)) ([ff2b3ab](https://github.com/LucasSantana-Dev/Lucky/commit/ff2b3ab9f3f06dd3b81194f4e3e3f8a113f523f5))
* **autoplay:** capture skip rejections (symmetric completion threshold) ([#1276](https://github.com/LucasSantana-Dev/Lucky/issues/1276)) ([c282414](https://github.com/LucasSantana-Dev/Lucky/commit/c282414346bf6c2247ed5d8a22c0c9bfcc5fdeb2))
* **autoplay:** key track start-time per track, not per guild ([#1275](https://github.com/LucasSantana-Dev/Lucky/issues/1275)) ([#1483](https://github.com/LucasSantana-Dev/Lucky/issues/1483)) ([0853a90](https://github.com/LucasSantana-Dev/Lucky/commit/0853a90412ed64c6e9cec7732311e5648cdb49f1))
* **autoplay:** provenance-aware genre guards open the seed neighborhood ([#1272](https://github.com/LucasSantana-Dev/Lucky/issues/1272)) ([405af1e](https://github.com/LucasSantana-Dev/Lucky/commit/405af1eae055f661a42310717c39adab6aa220a4))
* **autoplay:** weight popularity over name similarity in similar mode ([#1273](https://github.com/LucasSantana-Dev/Lucky/issues/1273)) ([cb24a7e](https://github.com/LucasSantana-Dev/Lucky/commit/cb24a7e9c6993b72be780c72710c524459f591d6))
* **backend:** bound pagination limit on leaderboard + starboard entries ([#1307](https://github.com/LucasSantana-Dev/Lucky/issues/1307)) ([c2b5cbe](https://github.com/LucasSantana-Dev/Lucky/commit/c2b5cbe2beceb2dc5761f74fb63eda03790de5d7))
* **backend:** degrade gracefully on external fetch timeouts ([#1342](https://github.com/LucasSantana-Dev/Lucky/issues/1342)) ([#1345](https://github.com/LucasSantana-Dev/Lucky/issues/1345)) ([5de7b69](https://github.com/LucasSantana-Dev/Lucky/commit/5de7b694e7215fd979ef506f66cb7d1f91067249))
* **backend:** log swallowed spotify search errors ([#1285](https://github.com/LucasSantana-Dev/Lucky/issues/1285)) ([#1318](https://github.com/LucasSantana-Dev/Lucky/issues/1318)) ([72a7431](https://github.com/LucasSantana-Dev/Lucky/commit/72a74317105f6ae6aedb817344f79bcf0a16b373))
* **backend:** replayed named creates return existing row ([#1320](https://github.com/LucasSantana-Dev/Lucky/issues/1320)) ([#1326](https://github.com/LucasSantana-Dev/Lucky/issues/1326)) ([be2b30c](https://github.com/LucasSantana-Dev/Lucky/commit/be2b30cdb69ad8d94665eb8ae2afb93c325bd5ce))
* **backend:** validate guildId snowflake on all 18 music routes ([#1297](https://github.com/LucasSantana-Dev/Lucky/issues/1297)) ([b93cfb5](https://github.com/LucasSantana-Dev/Lucky/commit/b93cfb565288a36bb9c0cbb36640eadb874505d6))
* **bot:** accurate reply when previous button has no history ([#1191](https://github.com/LucasSantana-Dev/Lucky/issues/1191)) ([#1331](https://github.com/LucasSantana-Dev/Lucky/issues/1331)) ([eb9b2ea](https://github.com/LucasSantana-Dev/Lucky/commit/eb9b2ea28b1f0581910f73833e09caec41f50f34))
* **bot:** bound all Spotify API fetches with an 8s abort deadline ([#1302](https://github.com/LucasSantana-Dev/Lucky/issues/1302)) ([b283159](https://github.com/LucasSantana-Dev/Lucky/commit/b2831594ecc1d456d6f683e89a2b22a996b9beb7))
* **bot:** catch resume errors in skip delayed play ([#1353](https://github.com/LucasSantana-Dev/Lucky/issues/1353)) ([#1354](https://github.com/LucasSantana-Dev/Lucky/issues/1354)) ([c2d2758](https://github.com/LucasSantana-Dev/Lucky/commit/c2d275872fbab168a1e7c603ca415ab3d3284c27))
* **bot:** catch settings fetch errors in idle disconnect scheduling ([#1361](https://github.com/LucasSantana-Dev/Lucky/issues/1361)) ([61b82e4](https://github.com/LucasSantana-Dev/Lucky/commit/61b82e4ce2f6f016b22ed5b0f6b672a4da55f0cb))
* **bot:** extend graceful bot-perm guard to mgmt + automod ([#1502](https://github.com/LucasSantana-Dev/Lucky/issues/1502)) ([1ee510d](https://github.com/LucasSantana-Dev/Lucky/commit/1ee510dd3773d7f55d5a0b7d7e2be7bc0e027c17))
* **bot:** graceful bot-permission guard + moderation pilot ([#1498](https://github.com/LucasSantana-Dev/Lucky/issues/1498)) ([#1499](https://github.com/LucasSantana-Dev/Lucky/issues/1499)) ([e2664ce](https://github.com/LucasSantana-Dev/Lucky/commit/e2664ce97b6d99a63521036d3d4b5dbd0a051878))
* **bot:** harden youtube extractor registration ([#1468](https://github.com/LucasSantana-Dev/Lucky/issues/1468)) ([#1472](https://github.com/LucasSantana-Dev/Lucky/issues/1472)) ([2e7f1bb](https://github.com/LucasSantana-Dev/Lucky/commit/2e7f1bbec46aab6d68d19aa07a4a503027d304bd))
* **bot:** queue summary position is milliseconds, not seconds ([#1202](https://github.com/LucasSantana-Dev/Lucky/issues/1202)) ([#1330](https://github.com/LucasSantana-Dev/Lucky/issues/1330)) ([efa9800](https://github.com/LucasSantana-Dev/Lucky/commit/efa98005cafc9e4cbacfcd8cc7f28b7bd5e26b6e))
* **bot:** skip startup session restore into empty voice channel ([#1469](https://github.com/LucasSantana-Dev/Lucky/issues/1469)) ([dbcc08c](https://github.com/LucasSantana-Dev/Lucky/commit/dbcc08ce511b0f19b1bc2c490c584113485e59b3))
* **bot:** thread real Client into endGiveaway ([#1383](https://github.com/LucasSantana-Dev/Lucky/issues/1383)) ([#1388](https://github.com/LucasSantana-Dev/Lucky/issues/1388)) ([d3b274a](https://github.com/LucasSantana-Dev/Lucky/commit/d3b274afa694ae8b35e3052ba8a366afee32d98f))
* **bot:** wire setupwebmusichandler at startup ([#1321](https://github.com/LucasSantana-Dev/Lucky/issues/1321)) ([#1351](https://github.com/LucasSantana-Dev/Lucky/issues/1351)) ([dc68e7e](https://github.com/LucasSantana-Dev/Lucky/commit/dc68e7efce26598161380c60bedb1a728a72748d))
* **ci:** grant review-tools caller the scopes its reusables require ([#1424](https://github.com/LucasSantana-Dev/Lucky/issues/1424)) ([c215675](https://github.com/LucasSantana-Dev/Lucky/commit/c2156759754ed65cfecb8f8fa9b25f5347522f5c))
* **ci:** quality/Lint green again — core rules off for bot/shared at root lint ([#1364](https://github.com/LucasSantana-Dev/Lucky/issues/1364)) ([#1365](https://github.com/LucasSantana-Dev/Lucky/issues/1365)) ([cc2322f](https://github.com/LucasSantana-Dev/Lucky/commit/cc2322f0ed999ffe1aabd341b1371260ace718d5))
* **compose:** tag container logs so loki labels them by name ([#1476](https://github.com/LucasSantana-Dev/Lucky/issues/1476)) ([4e956df](https://github.com/LucasSantana-Dev/Lucky/commit/4e956dfaad3ab88ea4d7d1f2db5874b3535f4cdd))
* **deps:** bump multer to 2.2.0 to fix high-severity dos advisory ([#1493](https://github.com/LucasSantana-Dev/Lucky/issues/1493)) ([4d57ac8](https://github.com/LucasSantana-Dev/Lucky/commit/4d57ac87b0b016ffd8d79306c0705f1294c9a37a))
* **deps:** bump qs to 6.15.2 and hono to 4.12.25 (audit) ([#1295](https://github.com/LucasSantana-Dev/Lucky/issues/1295)) ([ae5d949](https://github.com/LucasSantana-Dev/Lucky/commit/ae5d949c2f756eb554a24621c952cd8021b7a580))
* **deps:** pin piscina 4.9.3 for high-severity rce advisory ([#1504](https://github.com/LucasSantana-Dev/Lucky/issues/1504)) ([10b68e6](https://github.com/LucasSantana-Dev/Lucky/commit/10b68e6597bae7c39286662293f1587780df0a30))
* **docker:** add C toolchain to deps-production for opus source-build fallback ([#1310](https://github.com/LucasSantana-Dev/Lucky/issues/1310)) ([5ed7f11](https://github.com/LucasSantana-Dev/Lucky/commit/5ed7f11e0747eef6f303d1aa8f3f1fe8889eb351))
* **download:** drop invalid --extract-flat flag from yt-dlp download ([#1488](https://github.com/LucasSantana-Dev/Lucky/issues/1488)) ([9d29144](https://github.com/LucasSantana-Dev/Lucky/commit/9d291441d59ce7a01e717ad04f6844ac3d8b7947))
* **frontend:** default add-to-discord cta to public application id ([#1495](https://github.com/LucasSantana-Dev/Lucky/issues/1495)) ([efda71e](https://github.com/LucasSantana-Dev/Lucky/commit/efda71e38c7152abb0d5fca2a708cbe960720ec4))
* **help:** split large command categories across embed fields ([#1489](https://github.com/LucasSantana-Dev/Lucky/issues/1489)) ([0fa5786](https://github.com/LucasSantana-Dev/Lucky/commit/0fa578646fe0671eda85eb6b36db076c6e0fafb1))
* **player:** warn not error on bridge exhaustion for unplayable tracks ([#1507](https://github.com/LucasSantana-Dev/Lucky/issues/1507)) ([d7a4a58](https://github.com/LucasSantana-Dev/Lucky/commit/d7a4a5885ffa74fe5cbf22819df08a4dbc53e729))
* **security:** bump vite 8.0.16 + form-data 4.0.6 for high advisories ([#1457](https://github.com/LucasSantana-Dev/Lucky/issues/1457)) ([58d21d5](https://github.com/LucasSantana-Dev/Lucky/commit/58d21d56ad437bb5526dd5dcc9e5af3603d4b310))
* **shared:** env-isolate environment.test.ts (no secret dumps) ([#1292](https://github.com/LucasSantana-Dev/Lucky/issues/1292)) ([588037c](https://github.com/LucasSantana-Dev/Lucky/commit/588037cf8b3a7424ad922b15d28aeb8548eb082e))
* **shared:** log db error in feature-toggle override read ([#1286](https://github.com/LucasSantana-Dev/Lucky/issues/1286)) ([#1411](https://github.com/LucasSantana-Dev/Lucky/issues/1411)) ([0dfc409](https://github.com/LucasSantana-Dev/Lucky/commit/0dfc4091c1e688569f656851b39f06716eecb4a0))
* **shared:** make read-then-write service paths atomic ([#1199](https://github.com/LucasSantana-Dev/Lucky/issues/1199)) ([#1340](https://github.com/LucasSantana-Dev/Lucky/issues/1340)) ([ba1b840](https://github.com/LucasSantana-Dev/Lucky/commit/ba1b840accb4858837c0b46e8018b4d1bcd53291))
* **shared:** normalize embed template name on gettemplate ([#1327](https://github.com/LucasSantana-Dev/Lucky/issues/1327)) ([#1350](https://github.com/LucasSantana-Dev/Lucky/issues/1350)) ([d221b57](https://github.com/LucasSantana-Dev/Lucky/commit/d221b577db03473f0930747362c65861aae501fa))
* **shared:** safe env parsing via parseIntEnv helper ([#1209](https://github.com/LucasSantana-Dev/Lucky/issues/1209)) ([#1335](https://github.com/LucasSantana-Dev/Lucky/issues/1335)) ([32e3684](https://github.com/LucasSantana-Dev/Lucky/commit/32e36849ac0b8c9b3e839fc24a97f1f6c1972376))
* **shared:** validate guildautomation json on read ([#1194](https://github.com/LucasSantana-Dev/Lucky/issues/1194)) ([#1346](https://github.com/LucasSantana-Dev/Lucky/issues/1346)) ([93d9eea](https://github.com/LucasSantana-Dev/Lucky/commit/93d9eea104c989485b125eb2de494a8032c2f6b4))
* **spotify:** log oauth token-exchange failures ([#1286](https://github.com/LucasSantana-Dev/Lucky/issues/1286) track b) ([8306c35](https://github.com/LucasSantana-Dev/Lucky/commit/8306c35b19587d5b59e8092c0e245a2ed087b658))
* **twitch:** re-subscribe to EventSub after unexpected reconnect ([#870](https://github.com/LucasSantana-Dev/Lucky/issues/870)) ([#1395](https://github.com/LucasSantana-Dev/Lucky/issues/1395)) ([78a30f3](https://github.com/LucasSantana-Dev/Lucky/commit/78a30f31b9e97bd9e5fe86397ce5bdca272c0c10))
* **twitch:** refresh bot subscriptions on web add/remove ([#870](https://github.com/LucasSantana-Dev/Lucky/issues/870)) ([939d4b3](https://github.com/LucasSantana-Dev/Lucky/commit/939d4b3721158d0c52c2f9c7944709baf38d35c0))
* **web:** clear auth check promise on settle, not via 100ms timer ([#1311](https://github.com/LucasSantana-Dev/Lucky/issues/1311)) ([5cc8eef](https://github.com/LucasSantana-Dev/Lucky/commit/5cc8eefd7d83a5319175b056616ffe097a031299))
* **web:** report swallowed member-context fetch error to Sentry ([#1286](https://github.com/LucasSantana-Dev/Lucky/issues/1286) B3) ([#1416](https://github.com/LucasSantana-Dev/Lucky/issues/1416)) ([85f141d](https://github.com/LucasSantana-Dev/Lucky/commit/85f141d7926ef9eeec4a1195dda9702df25d7c02))
* **web:** route handled errors to Sentry, enforce no-console ([#1296](https://github.com/LucasSantana-Dev/Lucky/issues/1296)) ([a34e777](https://github.com/LucasSantana-Dev/Lucky/commit/a34e777d1627ad3a2715b49f211c4b7bd3e74266))


### Performance Improvements

* **bot:** bound external scrobbler track cache with lru+ttl ([#1282](https://github.com/LucasSantana-Dev/Lucky/issues/1282)) ([#1316](https://github.com/LucasSantana-Dev/Lucky/issues/1316)) ([7f29efc](https://github.com/LucasSantana-Dev/Lucky/commit/7f29efce0ea9ad0b6ad1dff6edfae57d4f15b2f8))
* **shared:** batch recommendation telemetry counts in one groupBy ([#1308](https://github.com/LucasSantana-Dev/Lucky/issues/1308)) ([e5a5973](https://github.com/LucasSantana-Dev/Lucky/commit/e5a5973d9c25d5926ab576b13265fe05c2d87032))

## [Unreleased]

## [2.17.0] - 2026-06-08

### Added
- feat(shared/bot/backend/web): support-report intake — `/support` flow with image + context, surfaced from command error embeds with a correlation id, backed by intake + admin routes with staff notification and an admin report view (#1228 #1240 #1241 #1245)
- feat(autoplay): ground autoplay on Last.fm seed-similarity + genre-conditioned scoring to stop drift to mainstream/unrelated music (#1268)
- feat(deploy): SHA-pinned deploys with automatic rollback on post-deploy health failure (#1230)
- feat(observability): deploy markers, heartbeat, and burn-rate alerts (Layers 1-3); capture escaping errors to Sentry at chokepoints (#1103 #1229)
- feat(web): per-route SEO metadata + sitemap, robots, and og-image (build-time, meta-only) (#1131 #1132)
- feat(levels): show member display names on the leaderboard instead of raw Discord ids
- feat(autoplay): quick-wins batch — mood-cache clear, provider telemetry, accept-rate; queueResolver telemetry pilot (#1100 #1102)

### Changed
- refactor(shared/bot): decommission Redis as source of truth — move track history, named queues, music session snapshots, guild counters, guild settings, and provider-health to Postgres/in-memory; drop the moderation, role-access, custom-command, and AutoMod-spam Redis caches (#1112 #1113 #1114 #1115 #1116 #1117 #1149 #1150 #1151)
- refactor: overengineering cleanup — remove dead code (legacy GuildAutomation execution service, vercel flags, unused hooks), honest web GA apply (records plan, no fabricated results), and usage telemetry (#1263)
- perf(bot): bound autoplay Maps and parallelize replenisher awaits; bound previously-unbounded `findMany` queries (#1214 #1215)
- refactor(shared/bot): consolidate `formatDuration`, remove dead interaction-reply utils, and drop a buggy token-overlap similarity util (#1212 #1216 #1246)

### Fixed
- fix(autoplay): lastfm-similar scores were crushed ~100× by a `match/100` bug; music guild FK P2003 prod write failures (snapshots + counters) re-targeted to `guilds.discordId` (#1269 #1270)
- fix(bot): lifecycle hardening — stop schedulers/timers and clear the presence interval on shutdown, reject (not resolve-null) the session-restore race, tear down the Discord client on init-step failure, and catch floating `setTimeout` promises (#1170 #1171 #1180 #1205 #1218)
- fix: resilience — bound external calls behind timeouts (Discord-429 storm + Musical-Taste hang), guard unsafe external API responses, and surface Redis init errors instead of swallowing them (#1141 #1176 #1217)
- fix(deploy): webhook mount, short-tag pinning, last-good persistence + rollback sha, and nginx health port; export missing `@lucky/shared` subpaths for prod ESM resolution (#1105 #1231 #1232 #1234 #1235 #1236 #1248 #1250)
- fix(shared): data integrity — wrap `ModerationService.createCase` in a transaction, make `LevelService.addXP` atomic, and Zod-validate embed data before persistence (#1167 #1168 #1178 #1179)
- fix(backend): assert required env vars at startup, enforce Discord-snowflake validation on guild routes, restrict the CORS allowlist to first-party hosts, and wrap Spotify routes in `asyncHandler` (#1169 #1172 #1219 #1247)
- fix(web): web-audit batch — settings response envelope, Levels RBAC + swallowed-fetch surfacing, Guild Automation dual-reject error state, RepoCard real stats, YouTube unavailability, dead featuresStore code, language dropdown (#1142 #1143 #1144 #1145 #1146 #1147 #1254)
- fix(bot): startup restore + watchdog scan Postgres (not Redis); expand SoundCloud short links and validate text channels before send (#1118 #1119 #1177 #1253)

### Security
- fix(security): redact secrets/PII from logs (#1220)
- security(backend): trim auth tokens/secrets before empty-checks (#1252)

### Internal
- ci: retire CodeRabbit (paid) and adopt cubic (free on public repos) as the codebase-aware AI reviewer; PR-Agent + claude-review remain. Removes `.coderabbit.yaml`. Amends ADR 2026-05-21.
- chore/ci/docs/test: assorted CI, dependency, documentation, and test-suite maintenance across the cycle.

## [2.16.0] - 2026-05-28

### Added
- feat(autoplay): record the selected autoplay mode (similar/discover/popular) on recommendation telemetry rows, enabling per-mode acceptance analysis (Phase D prerequisite) (#1096)
- feat(autoplay): guild skip-rate circuit breaker — pauses autoplay replenishment when a guild's rolling 24h skip-rate exceeds 60% (minimum sample of 5 resolved outcomes), posts a one-time notice to the music channel, and auto-resumes on the next manual `/play` (#1097)

### Changed
- test(shared): make the `packages/shared` Jest coverage gate honest — measure full runtime source (drop the broad `src/services`/`src/utils` exclusions) and set the threshold to the real floor (89/89/90/89) (#1076)

## [2.15.2] - 2026-05-28

### Fixed
- fix(deploy): move `prisma` CLI from devDependencies to dependencies so it ships in the production backend/bot images. The deploy-time `prisma migrate deploy --config prisma/prisma.config.ts` and the bot container startup both load `prisma.config.ts`, which imports `prisma/config` — that subpath must resolve in the production `node_modules`. It was only present by a hoisting accident that the #944 lockfile regen corrected, silently breaking every homelab deploy after that with `Cannot find module 'prisma/config'` → `MIGRATION_FAILED`.
- fix(build): pin `esbuild` to a single version (`0.27.3`) via `overrides`. Promoting `prisma` to a production dep pulled `tsx` (via `@prisma/dev`) into the `--omit=dev` image, where its nested `esbuild@0.28.0` collided with the hoisted `esbuild@0.27.3` and failed the binary-version postinstall validation. Unifying the version removes the dual-version conflict that caused the recurring esbuild build failures.

## [2.15.1] - 2026-05-28

### Fixed
- fix(backend): add primary redis cache read-through to `GuildAccessService.fetchUserGuilds` — every request was hitting Discord's `/users/@me/guilds` unconditionally, causing the 429 rate-limit storm (LUCKY-27, LUCKY-28) (#1078)
- fix(bot): unarchive idle discord thread before syncing the ai-dev-toolkit board; skip cycle gracefully if unarchive is not permitted, preventing recurring `DiscordAPIError[50083]` (LUCKY-3G) (#1078)

## [2.15.0] - 2026-05-24

### Added
- feat(frontend): ServerLogs + ServerSettings UI pages — view live container logs and edit server config from the dashboard (#965)
- feat(guild-automation): wire AutoMessages executor into the execution service; full apply path now flows through the Module Executor seam (#950)

### Changed
- ui(admin,config): redesign Admin + Config pages with full test coverage (#970)
- ui(entry-funnel): redesign Login + ServersPage; all tests passing (#967)
- ui(automation): redesign CustomCommands + GuildAutomation with full test coverage (#969)
- ui(integrations): add Spotify + LastFm test coverage (#968)
- refactor(bot): introduce `AutoplayContext` value object — removes primitive obsession in the autoplay pipeline (#983)
- refactor(shared): split `GuildAutomationService` into `GuildAutomationOrchestrator` + `GuildAutomationRepository` (#982)
- refactor(bot): extract `MessagePipeline` handler chain from the command dispatch layer (#981)
- refactor(artists): extract `ArtistSuggestionService` from the route handler into a testable service (#980)
- refactor(musicRecommendation): collapse multi-entrypoint engine to a single `recommendTracks` function (#979)

### Fixed
- fix(ci): add `lucky-bot` to required containers, remove dead unhealthy-grep before HEALTHCHECK TTL, add bot health poll after API checks (#1054)
- fix(bot): healthcheck now polls the Discord gateway (`/healthz` HTTP 200) instead of the Redis TCP port — catches real bot connectivity loss (#1047)
- fix(ci): post `error` commit status on deploy lock contention so CI sees the failure instead of timing out silently (#1052)
- ci(deploy): add "Wait for homelab deploy completion" step on the `docker_rebuilt=true` path — closes the race where CI went green before `deploy.sh` finished the bot health poll (#1056)
- fix(ci): surface async deploy outcomes via GitHub Statuses API (`homelab-deploy` context) — `deploy.sh` now posts `pending` → `success`/`failure` (#1046)
- fix(ci): hard-fail `deploy.sh` on sustained HTTP 429 from the OAuth endpoint instead of treating it as a successful deploy (#1045)
- fix(ci): lockfile-hash BuildKit npm cache key to prevent esbuild version mismatch across concurrent jobs (#1016)
- fix(ci): archive squash-merged release branches instead of failing the fast-forward job (#946)
- fix: resolve Prettier syntax error in `queueManipulation.spec.ts` (#985)

### Internal
- chore(backend): delete orphaned automod templates constant (#1053)
- test(bot): add YouTube smoke tests for search + playlist flows (#948)
- test(bot): Phase 4 test cleanup — ~93 tests removed (2,853 → 2,760); replace delegation-only specs with focused behavioural tests (#956–#1035)
- chore(bot): tighten coverage gate to 65.8/63.5/62/66.7 after Phase 4 cleanup (#996)
- chore: wire husky + lint-staged + `tsc --noEmit` pre-commit hook (#1007)
- chore: OSS positioning — portfolio framing, `SECURITY.md`, ADR-first README (#952)
- chore: repo organisation — untrack machine-local AI config, move release cadence docs (#951)
- ci: promote `madge` circular-dep gate to blocking on `main`
- docs: ADR for branch protection required checks (#949)
- docs: add decision records for May 23 refactor batch (#1040)
- chore(deps): routine dependabot bumps — actions, dev tools, production patches (#971–#977, #1042)

## [2.14.1] - 2026-05-23

### Fixed
- fix(docker): include repo-root `CHANGELOG.md` in the frontend build stage context — resolves broken production frontend image since v2.13.0 (#937)

### Internal
- ci: split sequential `quality-gates` job into four parallel test jobs; absorb `sonarcloud.yml` into `ci.yml` — tests run once with coverage, SonarCloud downloads artifacts. PR wall time ~8–10 min vs ~13–15 min (#942)
- chore(tests): three-phase bot + backend test cleanup — ~77 tests + ~5k LOC removed (#938 #939 #940)
- chore: add `.husky/post-merge` hook to auto-prune local branches whose remote was deleted (#941)

## [2.14.0] - 2026-05-22

### Added
- feat(bot): autoplay closed-loop telemetry writers (Phase B of the recommendation roadmap, ADR `2026-05-21-autoplay-recommendation-roadmap`). `recordRecommendationPick` inserts a `Recommendation` row at every autoplay pick (wired via the new `markAndRecordAutoplayTrack` wrapper in `diversitySelector.addSelectedTracks`); `recordRecommendationOutcome` flips `isAccepted`/`isRejected` on `playerFinish` (played > 30%) and `playerSkip` (< 5s). Thresholds exported as `OUTCOME_ACCEPT_PLAY_RATIO` / `OUTCOME_REJECT_EARLY_SKIP_MS` for Phase C tuning. All telemetry is non-throwing; failures never block queue replenishment or player events. (#933)
- feat(backend): autoplay telemetry read path — `GET /api/guilds/:guildId/recommendations/history?days=<n>` (Phase C of the recommendation roadmap). Returns per-source acceptance rate + global summary aggregated over the requested window (default 7 days, clamped to [1, 30]). Backed by the new `recommendationTelemetryReadService` in `@lucky/shared/services`. Read-only; zero regression risk. (#935)
- feat(download): cover and re-enable `/download` command behind `DOWNLOAD_VIDEO` / `DOWNLOAD_AUDIO` toggles. 37 new tests + URL-hostname-parsing helpers to satisfy CodeQL substring-sanitization. (#930)
- feat(music): cover and re-enable collaborative playlist mode behind `COLLABORATIVE_PLAYLIST` toggle. 51 new tests. (#929)
- feat(management): add test coverage for `/customcommand`. 25 new tests, no behavioural change. (#928)
- feat(management): cover and re-enable `/embed` builder behind `EMBED_BUILDER` toggle. 19 new tests. (#927)
- test(bot/recommendation): cover 4 untested recommendation handlers. 18 new tests. (#926)

### Changed
- refactor(bot): break the last runtime circular dependency in `packages/bot/src` (Cycle C, #889) by extracting `getTrackAudioFeatures`/`audioFeatureCache` to `autoplay/audioFeatures.ts` and `buildVcContributionWeights` to `autoplay/vcWeights.ts`. Public surface preserved via re-export. madge runtime cycles: 2 → 1 (only the deferred type-only `types/CustomClient` cycle remains). Unblocks promoting `.github/workflows/madge.yml` to a blocking gate. (#931)
- refactor(bot/autoplay): break Cycles A + B residuals (partial #889) by extracting `queueMarkers.ts` and `candidateContracts.ts`. madge runtime cycles: 4 → 2. (#925)
- chore(prisma): repurpose unused `Recommendation` model for autoplay closed-loop telemetry (Phase A of the recommendation roadmap). Adds `RecommendationSource` enum, `signals: Jsonb`, `discordUserId`, and a `(guildId, source, createdAt)` aggregation index; drops the unused `algorithm` column. (#932)

## [2.13.0] - 2026-05-21

### Added
- feat(shared): Guild Automation Module Executor seam + AutoMessages pilot — `Capture / Diff / Apply` lifecycle behind a port; first executor (AutoMessages) composed at orchestrator roots (#901)
- feat(frontend): Sentry React SDK + Router v7 tracing + replay — production frontend observability (#876)
- feat(backend): Prometheus `/metrics` endpoint + request middleware (#875)
- feat(bot): Prometheus `/metrics` endpoint + guild count gauge (#873)
- feat(bot): track guild join/leave history (#872)
- feat(ci): trivy image-scan on docker-publish — Phase A audit-only (#883)
- ui(landing): self-hosted developer-tooling register redesign (#868)

### Changed
- refactor(backend): migrate `validate.ts` + `autoMessages` schemas to Zod 4 API — closes the Zod 3/4 drift that was masking the brace-expansion CVE patch (#919)
- refactor(bot): break Cluster A + D circular dependencies (#885)
- refactor(bot): break monitoring telemetry cycles (Cluster B, #886)
- refactor(bot): break Cluster C autoplay cycles (#888)

### Fixed
- fix(deps): patch `brace-expansion` 5.0.5 → 5.0.6 (CVE-2024-45049 / GHSA-jxxr-4gwj-5jf2) and `ws` to 8.20.1 (GHSA-58qx-3vcg-4xpx) — `npm audit` clean (#921)
- fix(shared): import jest globals explicitly in autoMessagesExecutor spec (#902)
- fix(security): apk upgrade `nginx-alpine` base on build to patch CVEs (#881)
- fix(ci): unblock postinstall scripts hitting GitHub API rate limit (#878)
- fix(ci): group `$GITHUB_STEP_SUMMARY` redirects in madge workflow to satisfy shellcheck SC2129 (#905)

### Internal
- test(shared): add `coverageThreshold` gate to `packages/shared/jest.config.cjs` — no-regression floor at current baseline -2% (statements=19/branches=16/functions=15/lines=18) (#909)
- chore(process): add Feature-removal sweep checklist to PR template + advisory dangerfile guard that flags PRs with removal-pattern commits missing the sweep (#908)
- chore(docker): join bot+backend to shared `lucky-monitoring` network (#877)
- chore(docs): delete AI-generated noise + add policy ADR (#879)
- chore(docs): wire up AI-doc policy enforcement (gitignore + pre-commit) (#880)
- ci(madge): audit-only circular-deps gate (#887)
- docs(adr): trivy image-scan in CI, keep Snyk dashboard only (#882)
- docs(adr): pick #871 (bot circular-deps) as next refactor-pipeline target (#884)
- docs(adr): backend Zod 3 → 4 migration rationale + plan
- docs(adr): replace plan-limited PR review tools — drop Snyk/Greptile/CodeRabbit, adopt OSV-Scanner
- docs(adr): DiscordWriteAdapter port for Module Executors (design)
- docs(context): add `CONTEXT.md` with Module / Interface / Adapter / Seam vocabulary + Guild Automation glossary

## [2.11.0] - 2026-05-15

### Added
- feat(reliability): yt-dlp 3× exponential backoff + snapshot restore 2s timeout — hardens audio extraction against transient failures and bounds player restart latency (#850)
- ui(landing): redesigned with /ui-expert four-gate workflow — Vercel grid background + Stripe-style asymmetric scale strip + Notion-warm FAQ; named anchors enforced via slop audit
- ui(dashboard): asymmetric Stripe-style KPI hero + Linear-style Quick Actions list — replaces 4-tile identical-card layout with a focused information hierarchy

### Changed
- chore(docker): consolidate container surface — multi-stage Dockerfile, venv-packaged yt-dlp, node 22 alignment for frontend dev, /dev/tcp healthcheck for production-frontend, non-root nginx UID 101 (#848, #851, #856)
- refactor(compose): dedupe bot+backend env vars via `x-common-app-env` YAML anchor (#852)

### Fixed
- fix(docker): use /dev/tcp healthcheck in production-frontend stage to avoid wget/curl dependency (#851)

### Internal
- chore(ci): add explicit top-level `permissions:` to 8 workflows for least-privilege GITHUB_TOKEN scoping (#849)
- chore(ci): call org-wide reusable quality workflow — consolidates lint/typecheck/test/coverage gates (#855)
- chore(ci): smoke-test yt-dlp --version after bot image push to catch regression in audio pipeline (#854)
- docs(adr): Docker surface decisions — keep compose, keep node:22-alpine, consolidate Dockerfiles (#853)

## [2.10.0] - 2026-05-13

### Added
- feat(bot): Spotify API 429 retry with `Retry-After` header parsing — covers both delta-seconds and HTTP-date formats, hardened against unparseable values (#808)
- feat(autoplay): wire `recentSkipCount` into mood detection so the recommender adapts faster to user skips (#829)

### Changed
- refactor(autoplay): replace `reason` string with structured `RecommendationBasis { source, signals[] }`; serialization boundary via `serializeBasis()` (#830)

### Fixed
- fix(autoplay): block Spanish-language gospel tracks from autoplay when Last.fm is not linked, using Spotify-genre fallback and detector hardening (#818, #819, #820, #827)
- fix(autoplay): prioritize user tracks + Spotify-liked seeds, add sertanejo genre filter, expand Last.fm limits (#817)
- fix(lastfm): resolve canonical metadata for album art and multi-artist scrobbles (#821)
- fix(player): harden stream bridge error handling and add 57 missing tests covering reconnect + format negotiation
- fix(autoplay): remove YouTube fallback from seed search to prevent cross-language drift (#827)

### Internal
- chore(ci): revamp PR review tooling — Claude review action + Danger rules + chilled CodeRabbit profile, delegated to org-level reusable workflows (#838)
- ci(bot): pin coverage threshold floor before phase-2 test cleanup (#835)
- ci: extend workflow triggers to `release/**` branches for trunk-based-with-release-branches flow (#816)
- test(player): add `streamBridge` and `soundcloudMatcher` test suites
- chore(deps-dev): bump dev-dependencies group with 14 updates (#833)
- chore(deps): bump trufflesecurity/trufflehog action SHA (#832)
- chore(deps): bump base image from `node:22-alpine` to `node:26-alpine` (#831)

## [2.9.0] - 2026-05-05

### Added
- feat(admin): admin panel with writable global feature toggles — per-toggle enable/disable via the web UI, backed by `GlobalFeatureToggle` DB table (#801)
- feat(bot): `/artist` and `/album` commands are now gated behind feature toggles — admins can disable them without a redeploy (#800)

### Changed
- docs: refresh roadmap for v2.8.0 and add Prisma migration guide (#802)

## [2.8.0] - 2026-04-20

### Added
- feat(music): `/artist` — browse artist info, top tracks, and related artists from Spotify
- feat(music): `/album` — search and browse albums with track listings and playback integration

## [2.6.148] - 2026-04-20

### Added
- feat(bot): `/social` — 6 roleplay subcommands (hug, pat, kiss, dance, bonk, wave) with deterministic GIF rotation by (sender, target, action, day). Targets other users or falls back to self-phrase. No Tenor API dependency, no env vars, auto-discovered (#731)
- feat(bot): `/leaderboard tracks|artists [limit]` — top N music plays per guild via the existing `trackHistoryService.getTopTracks/getTopArtists` aggregation. Medal emojis for top 3, padded rank for 4–10, empty-state handling (#733)
- feat(bot): `/birthday set|clear` — month + day only (no year, no age), new `MemberBirthday` Prisma model with `@@unique([guildId, userId])` + `@@index([guildId, month, day])`. Validates Feb 30 rejected, Feb 29 accepted (#738)

### Fixed
- fix(ci): force `npm ci` in `preactjs/compressed-size-action` — defaulted to pnpm when both lockfiles existed, breaking every PR with frontend changes (#726)

### Changed
- chore(backend): downgrade cached-guild fallback log from warn to info — the event is expected steady-state, not a problem (#741)

## [2.6.147] - 2026-04-20

### Fixed
- fix(artists): suggestions cache pre-warm now waits up to 30s for Redis client `isHealthy()` before doing work — without it the call fired at module import time before redis finished its handshake and silently no-op'd. Adds infoLog/warnLog at every branch so cache state is visible in logs (#734)

## [2.6.146] - 2026-04-19

### Fixed
- fix(artists): pre-warm popular-artists Redis cache at backend startup so `/api/artists/suggestions` doesn't take 9s and 503 every time on a cold cache. Sentry LUCKY-35 was firing post-v2.6.145 because users without `user-top-read` OAuth scope hit the empty 503 path consistently. Now the route serves popular artists from Redis within milliseconds (#724)

## [2.6.145] - 2026-04-19

### Fixed
- fix(artists): Discover tab no longer shows letter-only placeholders when Spotify is silent — drops the image-less STATIC_FALLBACK_ARTISTS path, returns 503 instead, and lets the existing frontend retry UI handle it (#721)
- fix(settings): saving an autoplay genre on a fresh guild no longer silently 500s — `updateGuildSettings` now upserts (mirrors `setGuildSettings`) so it seeds defaults on first write. Also unblocks every bot `/autoplay` subcommand for first-time guilds (#721)

## [2.6.144] - 2026-04-18

### Fixed
- fix(artists): static last-resort fallback when Spotify rate-limits every path (user-top-read scope missing on stale tokens + popular-search 429s + Redis cache cold) — adds 52 hardcoded artist names so the suggestions grid is never blank (#717)

## [2.6.143] - 2026-04-18

### Fixed
- fix(artists): cache the per-user merged top-artists (3 time-ranges) in Redis under `artist:user:top:v1:<discordUserId>` for 15 min — the suggestions endpoint was taking 9.8–10s on every page load (Spotify multi-time-range fetch + popular fallback) and tripping the frontend's 10s axios timeout (#715)
- fix(artists): bump axios timeout for `getSuggestions` to 30s as a cold-cache safety net (#715)

## [2.6.142] - 2026-04-18

### Fixed
- fix(artists): active tab's count badge now uses bg-white/20 + text-white so the count stays readable on the brand-colored button (was previously brand-on-brand → invisible) (#713)
- fix(artists): suggestions errors now show the actual error message + a "Try again" button; previously every failure (503, 500, network) was silently masked as the generic "No suggestions available" empty state (#713)

## [2.6.141] - 2026-04-18

### Added
- feat(artists): Musical Taste page now uses 3 tabs (Discover · Preferred · Blocked) with URL-synced state via `?tab=`. Each artist tile in Discover gets explicit hover Prefer (♥) and Block (✕) action buttons, separating the prefer/block intent from the related-artist expand. Sidebar label renamed "Preferred Artists" → "Musical Taste" (#711)

### Fixed
- fix(artists): suggestions grid now shows a loading spinner on first paint instead of briefly flashing "No suggestions available" (#711)

### Changed
- chore: rename sidebar entry to "Musical Taste" to match the redesigned page (#711)

## [2.6.140] - 2026-04-18

### Added
- feat(artists): YouTube Music-style Preferred Artists experience — 150-artist seed with multi-time-range Spotify top-artists merge (short/medium/long term), flat-feed inline expansion with recursive splice/collapse, new Preferred Artists section in the UI (click-to-delete), already-preferred artists filtered from related expansions (#709)

## [2.6.139] - 2026-04-18

### Fixed
- fix(artists): cache popular-artists fallback in Redis (1h) — Spotify search API was returning 429 (rate-limited) for every page load, causing `/api/artists/suggestions` to return empty `{artists:[]}` and the Preferred Artists page to show "No suggestions available". Cached fallback bundle bypasses Spotify entirely after first request (#707)

## [2.6.138] - 2026-04-18

### Changed
- feat(artists): Related Artists now expand INLINE in the main grid (Spotify-style) — clicking an artist inserts a "Fans of X also like" row directly below; replaces the side carousel. Filter excludes already-preferred / blocked artists. Per-tile hover state (no more shared pink-border bug). Preferred tiles show a clear white-wash + check overlay; blocked tiles show red-wash + X overlay (#701)

## [2.6.137] - 2026-04-18

### Added
- feat(artists): YouTube Music-style Related Artists with horizontal carousel, larger circular avatars, scroll-snap, and 30-artist fetch limit (#699)

### Fixed
- fix(artists): filter already-preferred artists out of Related view to prevent re-adding (#699)
- fix(frontend): drop double `/api` prefix on Save Preferences batch URL (was hitting `/api/api/...` → 404) (#698)

## [2.6.136] - 2026-04-17

### Fixed
- fix(artists): replace dead Spotify recommendations API with Last.fm `artist.getSimilar` fallback for Related Artists — Spotify deprecated `/v1/recommendations` and `/v1/artists/{id}/related-artists` for new apps in 2024 (404), so we fetch the artist name from Spotify, query Last.fm for similar artist names, then look each back up via Spotify search to recover image/popularity/genres for the UI (#696)

## [2.6.135] - 2026-04-17

### Added
- feat(spotify): `getUserTopArtistsAndTracks` API wrapper for user-top artists/tracks (#686)
- feat(spotify): user-seeds — extract + cache top artists/tracks/genres for autoplay (#687)
- feat(autoplay): spotify-taste-blend — candidate scoring with user taste boost (#688)

### Fixed
- fix(autoplay): replenish queue on exhaustion + suppress recovery on stale snapshot (30 min staleness guard) (#691)
- chore(backend): eliminate lint errors in GuildAutomationExecutionService via typed Prisma model casts (#690)

## [2.6.134] - 2026-04-17

### Added
- feat(frontend): Lucky neon-brand landing page redesign — prominent glowing maneki-neko hero, Sora/Manrope typography, lucide icons in colored orbs, pink/orange/purple neon palette, framer-motion micro-interactions with reduced-motion support, monospace stats with pulsing online dot (#693)
- feat(autoplay): genre preferences Wave A — per-guild genre seeds influence autoplay recommendations (#679)
- test(backend): comprehensive validate middleware unit tests (#689)

### Fixed
- fix(frontend): correct Discord application `client_id` on Add-to-Discord button — invite now opens the real Lucky bot authorize flow instead of showing "Unknown Application" (#692)

## [2.6.133] - 2026-04-17

### Added
- feat(music): voice channel status updates on track start (#660)
- feat(stats): public `/api/stats/public` endpoint + animated countup on landing page (#667)
- feat(autoplay): refactor — queueManipulation split into 6 autoplay modules (candidateScorer, diversitySelector, spotifyRecommender, lastFmSeeder, candidateCollector, replenisher) (#658, #659, #662, #668, #669, #670)

### Fixed
- fix(backend): SSE heartbeat leak on client disconnect — AbortController guard prevents writes to dead sockets (#666)
- fix(bot): LRU+TTL on audio-feature cache — prevents unbounded memory growth (#663)
- fix(bot): LRU+TTL on duplicate-detection caches — 4 module-level Maps now bounded (#672)
- fix(bot): LRU+TTL on trackNowPlaying state — class wrapper with cleanupGuild() hook (#675, #676)
- fix(bot): cleanup Discord listeners and connections on SIGTERM/SIGINT (#676)
- fix(music): skip/stop controls — compounding fixes verified (#677)
- fix(security): require `guildModuleAccess` middleware on roles + moderation routes (#664)
- fix(security): apiLimiter on 7 backend routes, writeLimiter on mutations (#673)
- fix(security): follow-redirects CVE-2024-45590 bumped via pnpm.overrides (#673)
- fix(security): TruffleHog action SHA-pinned to v3.94.3 (#673)
- test(backend): fix Express 5 integration test breakage (#681)

### Changed
- chore(sonar): exclude bot entry point + event handler glue from coverage measurement

## [2.6.132] - 2026-04-16

### Added
- Intermediate release bundling Phase 3 refactor completion and first wave of memory hygiene

## [2.6.131] - 2026-04-16

- feat(landing): marketing landing page at `/` with hero, feature grid, stats strip, FAQ, footer

## [2.6.130] - 2026-04-15

### Fixed
- Dockerfile.frontend now builds `@lucky/shared` + runs `prisma generate` before frontend build — unblocks main CI `Build & Push Docker Images` and fixes `Cannot find module @lucky/shared/constants` TS error

## [2.6.129] - 2026-04-15

### Fixed
- `/api/artists/suggestions` no longer returns empty 304 — added explicit `Cache-Control: no-cache, no-store, must-revalidate` header so browser refetches fresh suggestions instead of replaying a cached empty response

## [2.6.128] - 2026-04-15

### Fixed
- Autoplay history race: `buildExcludedUrls` now also reads the most-recent URL from the freshly-fetched persistent (Redis) history, closing a race where `queue.history` (in-memory) lagged behind Redis and the just-played track could be re-selected
- Bot leave-then-rejoin replaying the same song: watchdog orphan session recovery now passes `skipCurrentTrack: true` so the rejoin continues with the next queued track instead of restarting the last-playing one
- Preferred Artists: related artists no longer empty — Spotify deprecated `/v1/artists/{id}/related-artists` (403 for new apps); replaced with `/v1/recommendations?seed_artists=<id>` fallback that dedupes recommended track artists
- Preferred Artists detail panel now responsive: inline below grid on small viewports, sticky sidebar on `lg+`
- Preferred Artists batch save: single `PUT /api/artists/preferences/batch` replaces the per-artist PUT fan-out when saving multiple preferences

## [2.6.127] - 2026-04-15

### Changed
- Phase 4 code hygiene: consolidated duplicate Zod schemas (`guildIdParam`, `userIdParam`) into `packages/backend/src/schemas/common.ts`; extracted 17 Discord color constants + grouped API route builders into `@lucky/shared/constants` (subpath-only, no barrel pollution); added `logAndRethrow`/`logAndSwallow` error helpers and replaced 8 empty catch blocks across `lastFmApi` and `spotifyApi` with structured logging

## [2.6.126] - 2026-04-15

### Fixed
- Autoplay genre drift: added genre-family penalty that prevents rap/hip-hop sessions from picking electronic tracks (and other cross-genre drifts). 10 genre families (rap_hiphop, rnb_soul, electronic, rock_metal, pop, latin, country_folk, jazz_classical, world, ambient_chill) — candidates whose family doesn't overlap the current track's family receive -0.6 penalty (strong anchors: rap_hiphop, rock_metal, latin) or -0.3 (weak anchors), effectively dropping them below the selection threshold
- Autoplay Spanish-language drift: hard-rejects Spanish/Latin candidates (-2.0 score) when the last 20 tracks of session history contain no Spanish markers (accents, Spanish stopwords, latin genres) — fixes cases where English/hip-hop sessions picked random Spanish tracks
- Low-popularity + disjoint-genre belt-and-suspenders penalty (-0.4): rejects obscure tracks whose genres don't match session

## [2.6.125] - 2026-04-15

### Changed
- Preferred Artists: default suggestions bumped from 12 → 24 artists; grid layout is now 5 columns (desktop) / 4 (md) / 3 (sm) / 2 (mobile); artist circle images enlarged to 128px

### Fixed
- Backend: pass SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI/LINK_SECRET env vars to backend service in docker-compose so `/api/artists/suggestions` fallback can use Spotify client-credentials flow

## [2.6.124] - 2026-04-15

### Added
- Preferred Artists page: default suggestions grid (replaces empty search state), click-to-expand related artists (Spotify API), and batch "Save Preferences" button that commits multiple prefer/block selections at once
- Backend `GET /api/artists/suggestions`: returns 12 suggested artists from user's Spotify top artists (if OAuth linked) with fallback to popular artists search

### Fixed
- Sidebar active-link: `/music` no longer activates when navigating to `/music/artists` or other music sub-routes — uses exact match for /music specifically
- Preferred Artists batch save preserves artist metadata from search results so preferences aren't lost when search is cleared before saving
- Docker production image now includes workspace-local `node_modules` for bot and backend workspaces — root cause of v2.6.123 lru-cache ERR_MODULE_NOT_FOUND crash loop

## [2.6.123] - 2026-04-14

### Added
- `POST /api/internal/notify`: homelab-only endpoint for sending Discord notifications from the server (content + embeds, auth via `INTERNAL_API_KEY`)

### Changed
- Phase 1 dedupe: deleted 368 LOC of 95%-duplicate files — `queueStateManager.ts`, `downloadHelpers.ts`, and `errorSanitizer.ts` now have a single canonical location; `errorSanitizer` moved to `@lucky/shared`
- Phase 2 memory hygiene: replaced 4 unbounded module-level Maps with LRU caches — `artistPopularityCache` (max 5000, 24h TTL), `audioFeatureCache` (max 10000, 24h TTL), duplicate-detection caches (max 1000, 1h TTL), and now-playing caches (max 500, 4h TTL); prevents long-running-bot memory growth

### Fixed
- CI: `Deploy to Homelab` workflow converted to manual-dispatch-only (no webhook listener was running on server — was failing silently on every push)

## [2.6.122] - 2026-04-14

### Fixed
- Music controls: Skip and Stop buttons no longer replay the just-skipped track after a 10–20 s silence — four compounding issues addressed in one atomic change
  - Autoplay replenish now respects explicit stop/clear: `handleStop`, `handleClear`, and web Stop/Clear actions set a 30 s per-guild suppression flag that short-circuits `replenishIfAutoplay` so autoplay cannot refill the queue with the just-played track
  - `handlePlayerSkip` now awaits `addTrackToHistory` *before* invoking the autoplay replenish loop, eliminating a race where the recommendation engine read a stale exclusion set and returned the skipped track again
  - Stream-error recovery (`recoverFromStreamExtractionError`) detects when YouTube returns the same track URL or title as the alternative and skips without reinsert, preventing the 10 s "find alternative → it's the same → replay" loop on broken stream URLs
  - Web dashboard Skip no longer uses a fire-and-forget `setTimeout`; publishes state only after `queue.node.skip()` resolves, eliminating stale state visible to the frontend
- `recoverFromStreamExtractionError` now surfaces the `same track alternative` warnLog consistently whether any or all YouTube results match the current track

### Security
- Session secret: `WEBAPP_SESSION_SECRET` is now required — bot refuses to boot with the `'fallback-secret-change-in-production'` fallback (#620)
- OAuth CSRF: Discord OAuth callback now validates a cryptographically random `state` token generated at login (`crypto.randomBytes(32)`) via `crypto.timingSafeEqual`; mismatches are rejected and the token is deleted after a single use (#622)

## [2.6.121] - 2026-04-14

### Added
- Preferred Artists page (`/music/artists`): YouTube Music-style artist picker where users search for artists, view related artists, and mark them as preferred or blocked — preferences persist to Postgres and influence autoplay recommendations
- Autoplay VC blend: when multiple users are in voice, autoplay now blends preferred/blocked artist preferences from all VC members (union of all preferences) instead of only the user who requested the current track
- Preferred artists set via the web UI now sync to the bot's autoplay scoring (previously only bot `/recommendation prefer` command wrote to the scoring engine)

### Fixed
- Stop command: `/stop` and the web player Stop button now clear all queued tracks before deleting the queue — previously stopping mid-session would cause the same track to resume on the next `/play` command

## [2.6.120] - 2026-04-14

### Fixed
- Autoplay: hard-reject ambient/noise content (rain sounds, ocean waves, white noise, ASMR, sleep music, binaural beats, meditation music, spa/yoga music) and DJ mixes/EDM sets (DJ set, festival set, extended club mixes, trance/EDM mixes) — these were slipping through the candidate pipeline despite being unrelated to the session's genre

## [2.6.119] - 2026-04-14

### Added
- Feature toggles: per-guild toggle state now persisted in the database — toggling a feature for a server survives bot restarts and takes priority over Unleash/fallback values; failed toggle updates surface as toast errors in the UI instead of silently discarding the change

### Fixed
- Autoplay genre drift: Spotify `/v1/recommendations` now receives `min_energy`/`max_energy`, `min_valence`/`max_valence`, and `min_danceability`/`max_danceability` constraints derived from the current track's audio features (±0.25 tolerance window) — prevents the algorithm from drifting to electro/EDM tracks when the session is playing reggaeton or forró with similar energy but a different genre profile
- Web music player: player now syncs with the bot's actual state when opening the app mid-playback — bot broadcasts state every 30 s for active queues, SSE writes are wrapped in try/catch to handle client disconnects, and the SSE connection lifecycle correctly ignores stale callbacks after component unmount
- Webapp sidebar: active tab highlighting fixed — `startsWith` was causing both `/music` and `/music/history` to highlight simultaneously; now uses exact match with `path + '/'` prefix fallback
- Track history: removed hardcoded 50-track cap; backend now accepts `offset` param and returns total count, enabling full pagination of the history list
- Server logs: pagination total count now comes from the server's actual log count instead of the current page slice length, fixing page range display
- Twitch notifications: added `GET /api/twitch/status` endpoint and pre-check in the UI — when Twitch API credentials are not configured, a clear banner is shown and the Add button is disabled instead of returning a generic 503

## [2.6.118] - 2026-04-14

### Added
- Music player: second button row with Stop, Clear Queue, and Clear Autoplay buttons — Stop deletes the queue and clears the player embed, Clear Queue removes all queued tracks, Clear Autoplay disables autoplay mode and refreshes the button state

### Fixed
- Autoplay dedup: Spotify returns the same song under different author metadata for different releases (e.g. `"DJ Jesh FSC"` vs `"DJ Jesh FSC, MC Biel"`) — `normalizeTrackKey` now strips comma-separated collaborators and `feat./ft./con./with` suffixes before normalizing, so both variants map to the same dedup key and are no longer queued twice
- `SpotifyAuthService`: extracted `fetchJson<T>` helper to reduce cyclomatic complexity and eliminate duplicated fetch/error-handling boilerplate in `exchangeCodeForToken`

## [2.6.117] - 2026-04-14

### Fixed
- `/queue` command crash: embed field value is now clamped to Discord's 1024-character limit — Spotify track URLs are longer than YouTube URLs so queues with many tracks overflowed the limit and were rejected by `EmbedBuilder.addFields` with "Received one or more errors"
- Queue track titles truncated to 40 chars in the track list to keep lines compact

## [2.6.116] - 2026-04-14

### Fixed
- Replaced built-in `SpotifyExtractor` from `@discord-player/extractor` with the community-maintained `discord-player-spotify` package — the built-in extractor has a confirmed unfixed bug (discord-player#1988) where text searches return 0 results despite valid credentials, causing every `/play` text query to fall back to YouTube

## [2.6.115] - 2026-04-13

### Fixed
- Autoplay dedup: `extractSongCore` no longer clips song names at a ` - ` separator that appears inside a parenthetical — e.g. `Nutshell (MTV Unplugged - HD Video)` now correctly extracts `Nutshell` instead of `Nutshell (MTV Unplugged`
- Autoplay dedup: `noiseTerms.json` adds `unplugged`, `mtv unplugged`, and `hd video` as version variants so parentheticals like `(MTV Unplugged)` and `(HD Video)` are stripped before key normalisation — prevents live/unplugged variants of a track from appearing as separate recommendations
- Play command: duplicate "Now Playing" embed eliminated — `/play` now pre-registers its deferred reply message so the `playerStart` handler edits it to the "Now Playing" embed instead of sending a second message

## [2.6.114] - 2026-04-13

### Added
- Autoplay: Spotify `/v1/recommendations` API integrated as the first candidate source — when the user has a linked Spotify account, the bot seeds the endpoint with up to 5 Spotify track IDs from the current queue, fetches 15 musically similar recommendations, then searches discord-player for each result. Spotify recommendation candidates receive a +0.3 score boost over standard seed-based candidates, so musically coherent picks reliably surface ahead of YouTube text-search results.

## [2.6.113] - 2026-04-13

### Fixed
- Autoplay dedup: fuzzy title matching via Levenshtein similarity (threshold 0.82) wired into `isDuplicateCandidate` — misspellings and minor title variants (e.g. "Sirens" vs "Syrens") are now caught as duplicates instead of slipping through exact-key checks
- Autoplay dedup: history window expanded from 100 to 150 tracks, reducing the chance of recently-played songs re-entering the candidate pool

## [2.6.112] - 2026-04-13

### Fixed
- Autoplay: candidates with `durationMS > 15 minutes` are now hard-rejected (`-Infinity` score) — 7-hour looped YouTube uploads no longer slip through the previous `-0.2` penalty
- Autoplay dedup: `(Tributo ao X)`, `[Tributo...]`, `(Homenagem a X)`, and `(HH:MM:SS)` duration annotations stripped from titles before key normalisation — tribute/fan-annotated versions of now-playing track now correctly deduplicated
- Autoplay quality: tracks whose resolved title contains `legendado`, `traduzido`, `tradução`, or `legendas` receive a `-0.4` "low quality upload" penalty, discouraging YouTube fan-upload junk even when Spotify fallback fires
- Autoplay source: Spotify score boost raised from `+0.15` to `+0.4` so Spotify candidates decisively beat YouTube fallbacks
- `noiseTerms.json`: added `legendas` to `bareTitleNoise`

## [2.6.111] - 2026-04-13

### Fixed
- Crash on startup: `import noiseTerms from './noiseTerms.json'` was missing the `with { type: 'json' }` import attribute required by Node.js 22 ESM — bot crashed immediately on every start

## [2.6.110] - 2026-04-13

### Fixed
- Autoplay session coherence: Last.fm candidates no longer receive the +0.15 session novelty boost, preventing off-genre tracks from the user's global listening history (e.g. Kanye West during a FNAF session) from outscoring on-session seed-based candidates
- Autoplay session drift: `getSessionOriginTrack()` finds the oldest user-added (non-autoplay) track in queue history and keeps it permanently in the seed pool — the original song that started the session always anchors recommendations even after many songs have played
- Autoplay diagnostics: `searchSeedCandidates` now logs `spotifyQuery` when Spotify returns 0 results and includes both `spotifyQuery` and `fallbackQuery` in the fallback warn log, making it diagnosable in production

## [2.6.109] - 2026-04-13

### Fixed
- Autoplay dedup: bare "Tradução" / "traduzido" in titles now stripped before key normalization, so "YE - FATHER Tradução" no longer bypasses the dedup check against "YE - FATHER"
- Autoplay: `purgeDuplicatesOfCurrentTrack()` runs at each replenish cycle start and removes any upcoming-queue entries that duplicate the now-playing track, eliminating stale duplicates that were added before the current song started
- Autoplay diversity: `LASTFM_SCORE_BOOST` reduced from 0.1 to 0.0 so Last.fm novelty candidates no longer outscore seed-based candidates — prevents unrelated-genre tracks from being injected into an otherwise coherent session

## [2.6.108] - 2026-04-13

### Fixed
- Last.fm seed tracks crashed silently with `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` because `user.getrecenttracks` and `user.getlovedtracks` return `artist: { '#text': '...' }` instead of `{ name: '...' }`. Code now reads `#text` first, falling back to `name`. This was disabling all Last.fm-based autoplay diversity, causing the same songs to repeat
- `/play`, `/playnow`, `/playtop`: primary Spotify error is now logged (was swallowed), making diagnosis possible
- `executePlayAtTop` (`/playnow`, `/playtop`): added Spotify → YouTube → SoundCloud fallback chain — previously had no fallback and would show an error embed if Spotify failed

## [2.6.107] - 2026-04-13

### Fixed
- Autoplay: query modifiers (`similar`, `like`, `playlist`, `mix`) were appended to the Spotify search query on every non-first replenish cycle — Spotify treats these as literal terms and returns 0 results, causing silent fallback to YouTube. Spotify query now always uses the clean base query; modifiers are only sent to YouTube/AUTO engines
- Autoplay dedup: cover variant parentheticals `(Cover - ...)`, `(Cover by X)` etc. were not stripped before `coreKey` computation because the old pattern only matched the exact strings `(cover)` and `(cover version)`. Pattern broadened to `(cover[^)]*)` / `[cover[^\]]*]`; `cover` added to `HYPHENATED_VERSION_SUFFIXES` so `"Song - Cover"` hyphenated titles are also normalized

## [2.6.106] - 2026-04-13

### Fixed
- Autoplay diversity: studio recordings now preferred over acoustic/live/cover variants via a -0.2 score penalty on version-variant titles
- Autoplay diversity: current playing track's artist now counts toward the per-artist cap so at most one more track from the same artist is queued per replenish cycle
- Autoplay diversity: selected tracks are interleaved round-robin by artist before insertion, preventing consecutive tracks from the same artist

## [2.6.105] - 2026-04-13

### Fixed
- Autoplay: cover-channel seeds (e.g. "ANATOMIA - Eu sei que é você (Acústico ao vivo)" by "Carlo Gatto") now extract the real artist from the title's left side via `extractTitleArtistFromSong`, yielding a clean Spotify query instead of falling back to the YouTube channel name
- Autoplay dedup: Brazilian/Portuguese acoustic parentheticals `(Acústico...)` and `[Acústico...]` are now stripped from titles before normalization, so studio and acoustic versions of the same song share a dedup key and only one is queued

## [2.6.104] - 2026-04-13

### Fixed
- Autoplay: when the YouTube channel name equals the artist name (e.g. `"ANATOMIA - ao pressão (Visualizer)"` by author `"ANATOMIA"`), the Spotify query was previously assembled as `"ao pressão ANATOMIA"` (flipped), causing Spotify search to fail and fall back to YouTube. The Spotify engine now receives the cleaned title directly (`"ANATOMIA - ao pressão"`) which Spotify natively parses as `"Artist - Song"`, restoring correct Spotify-first playback for artist-named channels

## [2.6.103] - 2026-04-13

### Changed
- Autoplay: Spotify engine now receives a clean `"Song Artist"` query (extracted via `extractSongCore`) instead of the raw title which could duplicate the artist name (e.g. `"Beyoncé - Halo Beyoncé"` → `"Halo Beyoncé"`), significantly improving Spotify hit rate
- Autoplay: Spotify-sourced candidates now receive a consistent +0.15 score boost and are exempt from the same-source penalty, ensuring Spotify tracks are preferred over equivalent YouTube tracks when available

## [2.6.102] - 2026-04-13

### Fixed
- Autoplay dedup: same-song variants selected within a single replenish cycle (e.g. "Beyoncé - Halo" and "Halo - Beyoncé (Lyrics)") now correctly deduplicated via extractSongCore key in selectDiverseCandidates and addSelectedTracks
- Autoplay dedup: Brazilian/Portuguese version qualifiers ("Versão Forró", "Ao Vivo", "Forró") now stripped from track titles before normalization, preventing different versions of the same song from both being queued

## [2.6.101] - 2026-04-13

### Fixed

- Autoplay dedup now correctly identifies the same song across YouTube title format variants (e.g. "Beyoncé - Halo (Tradução/Legendado)", "Halo - Beyoncé (Lyrics)", "Beyoncé - Halo Lyrics #music") — Brazilian noise patterns strip Tradução, Legendado, Clipe Oficial, hashtags, and bare Lyrics; `extractSongCore` extracts the song portion from artist-prefixed or inverted titles using the author field to disambiguate

## [2.6.100] - 2026-04-13

### Added

- Spotify batch audio features: batch-fetch up to 100 track audio features in one API call and score candidates by energy/valence delta against the current track
- Artist popularity weighting: discover mode boosts low-popularity artists (≤40), popular mode boosts high-popularity artists (≥70)
- Album cohesion scoring: same-artist candidates with shared title tokens get a +0.12 bonus, otherwise take a −0.35 same-artist penalty
- Multi-user VC blend: contribution weights balance autoplay picks proportionally across all VC members' listening history

### Fixed

- `enrichWithAudioFeatures` no longer throws `TypeError` when Spotify token mock returns undefined
- Album cohesion threshold corrected from unreachable `> 0.4` to `> 0`
- Removed redundant `getTrackAudioFeatures` call per replenish cycle

## [2.6.99] - 2026-04-13

### Fixed

- Spotify-first provider: SpotifyExtractor registered before YouTube so text searches resolve via Spotify first
- Queue Error on bridge exhaustion: `Bridge exhausted` now triggers stream recovery (skip + Discord notification) instead of raw error embed
- Extractor registration: null return from `player.extractors.register()` now logs a warning instead of silently succeeding

## [2.6.98] - 2026-04-13

### Fixed

- Autoplay same-song repetition: fan-upload noise patterns strip decorators (`[K-POP IN PUBLIC]`, Korean/CJK parentheticals, `[Fancam]`, `[MPD*]`, `M/V`) from dedup keys so the same track with different YouTube titles deduplicates correctly
- Autoplay artist blocking removed: only song-level dedup remains — artists are no longer penalised for playing consecutive tracks

## [2.6.97] - 2026-04-13

### Added

- Intelligent autoplay signals: skip and completion tracking, loved tracks, artist frequency scoring, session mood detection, audio feature matching via Spotify API

## [2.6.93] - 2026-04-12

### Added

- Multi-user voice channel taste blend: `consumeBlendedSeedSlice` distributes seeds across all VC members, blend status shown in autoplay display

## [2.6.92] - 2026-04-12

### Added

- Autoplay artist preferences: `/autoplay artist prefer/block` — blocked artists score -∞, preferred artists score +0.3

## [2.6.91] - 2026-04-12

### Added

- Autoplay genre/mood filters: `/autoplay genre` fetches top tracks via Last.fm tag API, `autoplayGenres[]` stored per guild

## [2.6.90] - 2026-04-12

### Fixed

- Autoplay same-song dedup: normalized candidate keys, title-only dedup, regex version suffix detection for broader coverage

## [2.6.89] - 2026-04-12

### Fixed

- Autoplay full session history exclusion: 100-track lookback window, broader version suffix detection
- Autoplay: history dedup extended to 100 tracks, query variation added, `getSimilar` seeding diversified
- Autoplay subcommands added: queue reason display, replenish serialised per guild

## [2.6.88] - 2026-04-11

### Fixed

- Spotify OAuth account linking: SpotifyLink model, SpotifyLinkService, backend routes, `/spotify` command, frontend page

## [2.6.87] - 2026-04-11

### Fixed

- Autoplay repeats: per-guild mutex serializes concurrent replenish calls so race conditions no longer allow the same track to be selected twice
- Autoplay repeats: tracks added to queue are immediately written to Redis history so the next replenish call excludes them
- Autoplay: history lookback increased from 20 to 50 entries (~3h session coverage)

## [2.6.86] - 2026-04-11

### Fixed

- Autoplay dedup: YouTube video ID extracted from URL so www/youtu.be/short URLs all match the same exclusion
- Finished track now passed to replenishQueue so just-played song is excluded even when currentTrack already advanced
- CI: SonarCloud reverted to self-contained coverage (artifact sharing between concurrent workflows was causing 0%% coverage)

## [2.6.84] - 2026-04-11

### Fixed

- Provider priority: Spotify → YouTube → SoundCloud; no more SoundCloud-first resolution
- Duplicate Now Playing message eliminated — interaction reply is addedToQueue only
- Autoplay dedup: hyphenated version suffixes stripped (– Remaster, - Live, - Official Audio)
- /stop no longer triggers watchdog reconnect (intentional-stop window extended)
- Manual voice kick detected via voiceStateUpdate, marked intentional
- /skip last song no longer triggers reconnect via emptyQueue event
- Queue embed empty field guard prevents Discord API rejection

## [2.6.82] - 2026-04-10

### Fixed

- **Player recovery error logging** — catch blocks in stream recovery, bridge exhaustion, and Last.fm handlers now emit `debugLog`/`warnLog` instead of silently swallowing errors. Completes Phase 3 of the reliability audit.

## [2.6.81] - 2026-04-10

### Fixed

- **Player retry logging** — retry failures now emit `warnLog` with track title and guild ID instead of being silently swallowed.
- **Shared `QueueMetadata` type** — created `packages/bot/src/types/QueueMetadata.ts`; replaced 6+ scattered `IQueueMetadata` interfaces across `errorHandlers`, `trackHandlers`, `trackNowPlaying`, and `queueManipulation` with a single typed import.
- **Bridge fallback hardening** — unhealthy SoundCloud results are now skipped before they reach the extractor, reducing silent failures.

## [2.6.80] - 2026-04-10

### Fixed

- **Extractor errors now visible** — `DefaultExtractors.loadMulti()` and `initPlayDlAndRegisterYoutubei()` were `void`-called, silently swallowing load errors. Errors now surface via `errorLog`.
- **Dynamic Node.js path for yt-dlp** — replaced hardcoded `/usr/local/bin/node` with `process.execPath` so the correct runtime is detected on all deployments.
- **Stream race condition** — added `settled` guard in `streamViaYtDlp` so `close` firing before `data` cannot double-settle the promise.
- **YouTube recovery timeout** — `queue.player.search()` in stream recovery now has a 10s `Promise.race` timeout; a hung YouTube API no longer blocks the player indefinitely.

## [2.6.79] - 2026-04-10

### Fixed

- **Silent stream failures** — when `playerError` fires and all recovery paths are exhausted, the bot now sends an error embed to the guild text channel: "⚠️ Could not play track — [title] could not be streamed from any source." Previously nothing was shown.
- **yt-dlp stderr captured** — the first line of yt-dlp stderr (e.g. "Video unavailable in your country") is now included in the rejection message and visible in logs.
- **Bridge exhaustion logs** — added `cleanedTitle`, `url`, and `stages[]` array to `Bridge: all stages exhausted` error entries.

## [2.6.78] - 2026-04-10

### Fixed

- **Silent audio playback (critical)** — two root causes found and fixed:
  1. `streamViaYtDlp` consumed the first chunk from yt-dlp's stdout (the WebM EBML header `1a 45 df a3`) via `once('data')` and discarded it. discord-player/ffmpeg received a headerless stream and could not decode the codec, resulting in silence. Fixed with a `PassThrough` that re-injects the first chunk before piping the remainder.
  2. yt-dlp spawned without a JavaScript runtime (`node: unavailable`). Added `--js-runtimes node:/usr/local/bin/node` so YouTube extraction uses the full JS extractor and all audio formats are available.

## [2.6.77] - 2026-04-10

### Fixed

- **Duplicate "Now Playing" message** — `/play` no longer sends two separate "Now Playing" embeds when the track starts immediately. The interaction reply is now registered as the guild's now-playing display; the `playerStart` handler edits it (refreshing buttons) instead of posting a second message.

## [2.6.76] - 2026-04-10

### Fixed

- **`markAsAutoplayTrack`** — no longer throws when discord-player seals `metadata` as non-configurable; detects the descriptor and mutates the returned object directly instead of calling `Object.defineProperty`.
- **Last.fm 403 Sentry noise** — expired session key errors (403 "Invalid session key") downgraded from `errorLog` (Sentry) to `warnLog`. Was firing after every track play when Last.fm needs re-auth.
- **SoundCloud `?in=` playlist context** — `normalizeSoundCloudUrl` strips the `?in=<playlist>` query param before the extractor receives the URL, fixing `NoResultError` on valid SoundCloud track URLs shared from a playlist.

## [2.6.75] - 2026-04-10

### Fixed

- **`/play` search reliability** — default text search now uses `AUTO_SEARCH` (picks best available extractor) instead of requiring Spotify API to succeed first. Fixes "not playing" for songs where Spotify search was failing.
- **Search fallback chain** — restored full fallback (primary → YouTube → AUTO) for all providers including explicit `provider:spotify`. A fallback source is always better than an error. Fallback attempts are now logged at WARN level.
- **Bridge failures visible** — yt-dlp stream failures now appear in production logs (escalated from DEBUG to WARN).

## [2.6.74] - 2026-04-10

### Fixed

- **`/play provider:spotify`** — explicit provider choice is now respected; bot no longer silently falls back to YouTube when the user specified a provider. Fallback only applies when no provider is given.
- **Stream recovery** — `playerError` handler now correctly recovers from `NoResultError: Could not extract stream` by inserting the YouTube alternative at the front of the queue and skipping the failing track, instead of re-playing the same failing track.

## [2.6.73] - 2026-04-10

### Added

- **`/history [page]`** — paginated view of recently played tracks; shows title, artist, duration, relative Discord timestamp, and 🤖 tag for autoplay-queued tracks. Backed by existing `trackHistoryService` (Redis ring buffer, 100 tracks, 7-day TTL).

## [2.6.72] - 2026-04-10

### Added

- **`/djrole set <role>`** — restrict all music commands to users with a designated DJ role; server admins (ManageGuild) always bypass the check
- **`/djrole clear`** — remove the DJ role restriction
- **`/djrole show`** — display the currently configured DJ role
- **`/voteskip`** — democratic skip: cast a vote to skip the current track; skips automatically when the threshold (default 50%) of eligible voice members vote. Threshold is configurable via `GuildSettings.voteSkipThreshold`. Vote state clears on track change.
- **`/settings music idle-timeout <minutes>`** — configure how long (0–60 min, 0 = disabled) the bot waits in an empty voice channel before automatically disconnecting. Integrates with `MusicWatchdogService.markIntentionalStop` to prevent watchdog reconnect.

### Fixed

- **SoundCloud bridge matching (Sentry LUCKY-26/2P)** — Brazilian funk and tracks with compound DJ names (e.g. "DogDog" vs "Dog Dog" on SoundCloud) now match correctly. Changes:
  - Token match changed from 100% (`every`) to 75% threshold, tolerating accent stripping and compound-word splits
  - Duration tolerance relaxed from 15 s to 30 s
  - `normalizeForMatch` regex uses literal space instead of `\s` (avoids Unicode edge cases)
  - New 3rd fallback stage: strips content from first `(` in the cleaned title and retries SoundCloud search (e.g. "Bohemian Rhapsody (Official Music Live Session)" → "Bohemian Rhapsody")

## [2.6.71] - 2026-04-10

### Added

- **`/playtop <query>`** — queue a track at the front (plays next after current)
- **`/playskip <query>`** — queue a track at the front and immediately skip the current track
- **`/skipto <position>`** — skip all tracks before the given queue position
- **`/seek <time>`** — seek to a position in the current track (`mm:ss` or raw seconds)
- **`/replay`** — restart the current track from the beginning
- **`/leavecleanup`** — remove all queued tracks requested by users who have left the voice channel
- **`/nowplaying`** — alias for `/songinfo`; shows current track with rich embed
- **`/effects bassboost <0-5>`** — apply bass boost via FFmpeg filter (levels map to `bassboost_low` → `bassboost_high`)
- **`/effects nightcore`** — apply nightcore (speed + pitch up) FFmpeg filter
- **`/effects reset`** — remove all active audio effects
- **`/volume`** range extended to 1–200 (was 1–100)
- **`/pause`** now toggles (pauses if playing, resumes if paused); `/resume` removed
- **`/play`** optional `provider` parameter: `spotify` (default) | `youtube` | `soundcloud`
- **`/purge <amount> [user] [contains]`** — bulk delete 1–100 messages; optional user and content filters
- **`/lockdown [reason]`** — toggle `SendMessages` permission for `@everyone` in the current channel
- **`/slowmode <seconds>`** — set channel slowmode (0 = off, max 21600s / 6h)
- **`/autorole add <role> [delay_minutes]`** — assign a role to all new members on join, with optional delay up to 1440 minutes
- **`/autorole remove <role>`** — remove a configured autorole
- **`/autorole list`** — display all configured autoroles for the guild
- **`/giveaway start <duration> <prize> [winners]`** — start a giveaway with 🎉 button entry; duration in `1h`/`30m`/`2d` format
- **`/giveaway end <message_id>`** — end a giveaway early and pick winners
- **`/giveaway reroll <message_id>`** — reroll winners for a completed giveaway
- **Autoplay default ON** — guilds with no stored preference now default to autoplay enabled on new queues
- **Cross-session autoplay deduplication** — `replenishQueue` fetches the last 20 played tracks from persistent history and excludes them from autoplay candidates, preventing recently-played songs from cycling back cross-session

## [2.6.70] - 2026-04-10

### Fixed

- **Autoplay metadata write crash (Sentry LUCKY-2K)** (`packages/bot/src/utils/music/queueManipulation.ts`): `markAsAutoplayTrack` was directly assigning to `track.metadata`, which is a getter-only property on discord-player Track objects. This threw `TypeError: Cannot set property metadata of [object Object] which has only a getter` on every autoplay replenishment call (9 Sentry events in 24h, silently breaking autoplay since v2.6.65). Fixed by replacing direct assignment with `Object.defineProperty(..., { writable: true, configurable: true })`.
- **Source priority ordering**: stream bridge (`playerFactory.ts`) now tries direct YouTube streaming first, falling back to SoundCloud search. Search engine order in autoplay replenishment and Last.fm queries changed from `[SPOTIFY_SEARCH, AUTO, YOUTUBE_SEARCH]` to `[SPOTIFY_SEARCH, YOUTUBE_SEARCH, AUTO]`. `/play` fallback chain now goes Spotify → YouTube → AUTO instead of Spotify → AUTO.

## [2.6.69] - 2026-04-10

### Fixed

- **`/autoplay` 5-10s lag** (`packages/bot/src/functions/music/commands/autoplay.ts`): added `deferReply()` before the DB calls — Discord was timing out waiting for the initial acknowledgement, causing the "Lucky is thinking…" spinner to persist for 5-10 seconds or fail entirely.
- **Music buttons "This interaction failed"** (`packages/bot/src/handlers/musicButtonHandler.ts`): `deferUpdate()` is now called as the very first operation before any checks or queue resolution, guaranteeing the 3-second acknowledgement window is always met. Error responses (not in voice, no queue) use `followUp({ ephemeral: true })` since the interaction is already deferred.
- **`/play` slow reply** (`packages/bot/src/functions/music/commands/play/index.ts`): `applyStoredAutoplayPreference` (Prisma) and `blendAutoplayTracks` (Spotify API) were blocking the "Now Playing" embed. Both now run fire-and-forget after `interactionReply` — users see the response immediately, queue population continues in background.
- **Autoplay repeated songs** (`packages/bot/src/utils/music/searchQueryCleaner.ts`, `packages/bot/src/utils/music/queueManipulation.ts`): `normalizeTrackKey` now uses `cleanTitle`/`cleanAuthor` before hashing, stripping version suffixes so "(Live)", "(Acoustic)", "(Cover)", "(Remix)", "(Instrumental)", etc. are treated as the same song for deduplication. Added 17 new version-variant noise patterns to `NOISE_PATTERNS`.

### Changed

- **Autoplay default ON**: guilds without a stored autoplay preference now default to autoplay enabled on new queues — no more manual `/autoplay` needed on first use.

## [2.6.68] - 2026-04-10

### Fixed

- **Button interaction timeout** (`packages/bot/src/handlers/musicButtonHandler.ts`): `deferUpdate()` is now called centrally after the voice-channel and queue guards, extending the acknowledgement window to 15 minutes for all button handlers. Handlers that update the message use `editReply()` instead of `update()`, and the loop-mode ephemeral reply uses `followUp()`. This prevents "This interaction failed" when Discord's 3-second acknowledgement window expires before the handler returns.
- **Leaderboard pagination buttons silently failing** (`packages/bot/src/handlers/interactionHandler.ts`): `leaderboard_page_*` buttons were not matched by the music-button routing predicate and fell through to `reactionRolesService`, which sent no response. Added `leaderboard_page` to the routing check so pagination buttons are handled by `handleMusicButtonInteraction`.
- **Bot reconnecting and resuming after `/stop` and `/leave`**: `connectionDestroyed` and `disconnect` lifecycle events both called `musicWatchdogService.checkAndRecover()`, which rejoined the voice channel and triggered a session restore. Added `MusicWatchdogService.markIntentionalStop(guildId)` — sets a 5-second flag that short-circuits recovery in `checkAndRecover()`. `/stop` and `/leave` call it immediately before `queue.delete()`.

## [2.6.67] - 2026-04-10

### Fixed

- **YouTube extractor registration** (`packages/bot/src/handlers/player/playerFactory.ts`): `discord-player-youtubei@3.0.0-beta.4` renamed the extractor class from `YoutubeiExtractor` to `YoutubeExtractor` and removed `streamOptions.useClient` / `generateWithPoToken` from the registration options. The old import resolved to `undefined`, causing every bot startup to silently skip YouTube extractor registration and log "YouTube extractor unavailable." All YouTube-backed tracks then fell through to the SoundCloud extractor, which cannot stream tracks unavailable on SoundCloud (e.g. anime openings, niche indie tracks), producing `NoResultError: Could not extract stream for this track` (Sentry LUCKY-2J). Fix: resolve the export by name with a v2 fallback (`YoutubeExtractor ?? YoutubeiExtractor`), drop the removed options, and guard explicitly when neither export is present.

## [2.6.66] - 2026-04-09

### Added

- **`buildCommandTrackEmbed` helper** (`packages/bot/src/utils/general/responseEmbeds/buildTrackEmbed.ts`): combines `trackToData + buildTrackEmbed + setAuthor` into a single call. Used by `pause`, `resume`, and `skip` commands to display a rich track embed with a custom status label (e.g. "⏸️ Paused", "▶️ Resumed", "⏭️ Song skipped") as the embed author.
- **Shared embed builder utilities** (`packages/bot/src/utils/general/responseEmbeds/`): `buildTrackEmbed`, `buildUserProfileEmbed`, `buildListPageEmbed`, `buildPlatformAttribEmbed` — reusable embed constructors shared across commands. Embed functions in `embeds.ts` unified to `createSuccessEmbed`, `createErrorEmbed`, `createInfoEmbed`, `createWarningEmbed`.

### Changed

- **`/pause`, `/resume`, `/skip` commands**: show a rich track embed (title, thumbnail, duration, platform badge, requester footer) instead of a plain text success message when a track is active.
- **`/songinfo` command**: migrated to `buildTrackEmbed` + `trackToData`, removing the legacy inline embed builder.
- **`/level leaderboard`**: results are now paginated (5 entries per page) with prev/next buttons, preventing Discord embed field truncation for guilds with many members. Fetches up to 50 entries via `levelService.getLeaderboard(guildId, 50)`.
- **Queue embed** (`/queue` command): rebuilt with `createQueueEmbed` — structured sections for now-playing, upcoming tracks, queue stats, and music controls, all consistent with shared embed patterns.
- **Engagement commands** (`/starboard`, `/lastfm`): migrated to shared embed builders (`buildListPageEmbed`, `buildPlatformAttribEmbed`, `createSuccessEmbed/createErrorEmbed/createInfoEmbed`).
- **Autoplay embed** (`/play` now-playing): added `.setTimestamp()` to embed builder for consistent timestamp display. Error handler for the `play` command now uses `createErrorEmbed`.

## [2.6.65] - 2026-04-09

### Added

- **resilient `/play` stream bridge**: `playerFactory` now uses a 3-stage fallback (`createResilientStream`) — SoundCloud with cleaned `title + author`, SoundCloud with title only, then direct `playdl.stream(track.url)` against the source URL. Spam-uploader channels (Best Songs, NCS, etc.) skip SoundCloud stages entirely. Every stage emits `debugLog` so bridge failures surface in Sentry with full context. Fixes the silent playback failure for kpop, niche, and indie tracks where the previous single-point SoundCloud lookup returned nothing and emitted `NoResultError` after the "Now Playing" embed had already been sent.
- **`searchQueryCleaner` utility** (`packages/bot/src/utils/music/searchQueryCleaner.ts`): shared `cleanTitle`, `cleanAuthor`, `cleanSearchQuery`, and `isSpamChannel` helpers. Expanded `NOISE_PATTERNS` now cover `[Download]`, `(Official)`, `(Music Video)`, `(HD)`, `(4K)`, `(Remastered YYYY)`, `(Extended Mix)`, pipe separators, empty bracket pairs, and VEVO suffixes. `queueManipulation.ts` imports from the shared cleaner instead of maintaining its own local copy.
- **upgraded now-playing embed** (`buildPlayResponseEmbed`): three response kinds — `nowPlaying`, `addedToQueue`, `playlistQueued` — chosen automatically based on queue state. Detects source platform (Spotify / YouTube / SoundCloud / Apple Music / Vimeo) via `track.source` or URL sniffing and applies the platform's brand color. Shows track thumbnail, clickable title, author, duration, source label, queue position (for `addedToQueue`), and requester tag + avatar in the footer. Playlist responses show playlist title + track count.

### Fixed

- **`/play` queue position display**: `queuePosition` now reflects the track's actual final slot in the queue (found by id) rather than the snapshot queue length, which was wrong when `moveUserTrackToPriority` or `blendAutoplayTracks` had already reordered tracks.
- **SoundCloud match predicate**: `findMatchingSoundCloudResult` now requires all non-empty tokens of the cleaned query to be present in the candidate string (token-based AND), preventing short result names from falsely matching longer queries via substring inclusion.
- **playlist embed URL**: the `playlistQueued` embed branch now sets `embed.setURL(playlist.url)` only when a playlist URL exists, and no longer falls through to `track.url`.

## [2.6.64] - 2026-04-07

### Added

- **scheduled weekly mod digest**: `/digest schedule <channel>` now persists a weekly automated digest configuration in Redis and posts a sample digest immediately so moderators can confirm the channel works. A new in-process scheduler ticks every hour, picks up due guilds, and delivers the digest via the same shared embed builder used by `/digest view`. `/digest unschedule` removes the schedule. The scheduler is single-flight (overlapping ticks short-circuit), isolates per-guild errors so one bad guild can't break the loop, validates `MOD_DIGEST_TICK_INTERVAL_MS` and `MOD_DIGEST_PERIOD_DAYS` env vars, and starts independently of the rest of the ready handler so an unrelated upstream failure can't suppress weekly digests.

### Changed

- **`/digest view` accuracy**: switched the view subcommand from a 500-row recent-cases truncation to a date-bounded `getCasesSince(cutoff)` query that matches the scheduler. The 7d/30d/90d period now returns exactly the cases inside the window regardless of how many cases the guild has. Backed by a new `moderation_cases(guildId, createdAt)` composite index so the query is index-served.

## [2.6.63] - 2026-04-07

### Added

- **named music sessions**: `/session save|restore|list|delete <name>` lets each guild keep up to 10 named queue snapshots in Redis (30-day TTL) alongside the existing auto-snapshot system. Restore and delete subcommands expose autocomplete so saved session names are one keystroke away.
- **cross-module dashboard overview**: the frontend overview page now renders Recent Music, Level Leaderboard, and Starboard Highlights sections gated by RBAC module access, turning the dashboard into a real guild command center instead of a moderation-only summary.

### Fixed

- **production YouTube playback**: the YoutubeiExtractor silently failed in production because the `youtube-dl-exec` transitive dependency was missing from the bot package after an upstream bump. It is now an explicit dependency and the extractor failure no longer reaches users as `NoResultError: Could not extract stream for this track`.
- **command availability hardening**: command bootstrap no longer depends on eager Prisma initialization from `moderationSettings`, so slash commands such as `/version` and `/autoplay` stay available even when unrelated shared service modules would otherwise fail during import.
- **version command accuracy**: `/version` now prefers the runtime package version (`npm_package_version`) and falls back to the root `package.json`, avoiding stale `packages/bot/package.json` version output after releases.

### Changed

- **Spotify-first search priority**: `/play` and autoplay seed searches now try `SPOTIFY_SEARCH` before falling back to `AUTO` and `YOUTUBE_SEARCH`, so a query for a song title matches the actual track instead of an hour-long YouTube compilation with a similar name. URL inputs still bypass this and use `AUTO` directly.
- **autoplay recommendation quality**: seed queries are now cleaned of YouTube noise (`(Official Video)`, `- Topic`, `ft.`, etc.), results longer than 10 minutes are filtered out, results over 7 minutes are score-penalized, and an artist-level broad fallback runs when the seed search returns no viable candidates. Scoring also widens the "similar energy" duration window and keeps a small bonus in the near range.
- **frontend shell/sidebar foundation**: strengthened the Lucky sidebar into a clearer guild command center with a more prominent active guild block, explicit readiness state, stronger nav grouping, and fuller active-route treatment while keeping route structure unchanged.
- **autoplay diversity tuning**: autoplay recommendation scoring now penalizes same-source tracks more strongly, helping the queue favor varied sources without changing the existing hard caps that prevent refill starvation.
- **presence rotation interval**: added `BOT_PRESENCE_ROTATION_INTERVAL_MS` so non-music Discord presence updates can be slowed down or sped up without changing code, while clamping unsafe low values.
- **presence activity templates**: restored `BOT_PRESENCE_ACTIVITIES` support for tokenized rotation entries, fallback text, and Discord-safe rendering limits while preserving the existing interval behavior.

## [2.6.62] - 2026-04-04

### Fixed

- **play command Sentry noise reduction**: `/play` now treats `DiscordAPIError[10062]` (`Unknown interaction`) as an interaction-expired path before logging command failures, and safely exits when `deferReply` already expired. This prevents recurring false-positive production error reports for already-handled interaction expiry events.

### Changed

- **Criativaria `/serversetup` maintainability**: extracted the Criativaria setup execution into dedicated helper modules and focused tests so the command behavior remains stable while the management setup flow becomes easier to maintain and extend.

## [2.6.61] - 2026-04-03

### Fixed

- **external Last.fm scrobbler**: Invalid Last.fm sessions (`error: 9`, "Invalid session key") are now auto-unlinked per user when detected during `updateNowPlaying`/`scrobble`, preventing repeated log/error spam from stale credentials.
- **Last.fm unlink resilience**: unlink operations now treat Prisma `P2025` (already absent link) as a successful cleanup path, preventing repeated error spam when invalid-session cleanup races or records are already removed.
- **external Last.fm scrobbler fallback control**: per-user scrobbling now disables environment session-key fallback (`LASTFM_SESSION_KEY`) when resolving member keys, preventing repeated cleanup loops for users without valid linked sessions.
- **voice connection hardening (`/play`)**: `player.play` now receives `nodeOptions.connectionTimeout` from environment config, and watchdog recovery performs one additional rejoin wait cycle before failing.

### Changed

- **music connection defaults**: `PLAYER_CONNECTION_TIMEOUT` default increased from `5000` to `15000` ms, and production compose now injects `PLAYER_CONNECTION_TIMEOUT` plus `MUSIC_WATCHDOG_RECOVERY_WAIT_MS` explicitly for deterministic runtime behavior.

## [2.6.60] - 2026-04-01

### Fixed

- **play command**: Validation (guild context and voice channel) now runs before `deferReply`. Errors reply ephemerally via `interaction.reply` so the user sees the message privately without a public "bot is thinking" indicator.
- **guildconfig command**: Same validation-before-defer fix — guild-only guard now replies ephemerally before deferring.
- **embed converter**: Removed hardcoded Portuguese strings (`"erro"`, `"Erro"`, `"Informação"`) from `interactionReply.ts`; error/info embed detection is now language-agnostic.
- **command loader**: De-duplicate when a flat file (e.g. `play.ts`) and a subdirectory index (e.g. `play/index.ts`) both exist — flat file takes precedence, preventing the same command loading twice.

### Changed

- **version command**: Read bot version from `process.env.npm_package_version` at startup instead of streaming `package.json` at runtime — eliminates the file I/O on every `/version` invocation.

### Added

- **`GET /api/health/version`**: New endpoint returning `{ commitSha, version }` from Docker build args and `npm_package_version`. Enables the deploy pipeline to verify the exact commit SHA went live before marking the deploy successful.

### CI/Infrastructure

- **deploy pipeline**: Wait for `docker-publish` to complete before firing the homelab webhook. Fail closed when no docker-publish run is found for the commit SHA (opt-out via `FORCE_UNVERIFIED_DEPLOY=true`).
- **deploy pipeline**: New *Validate deployed version* step polls `/api/health/version` until the deployed `commitSha` matches `github.sha` before proceeding to OAuth smoke checks — eliminates false-positive green deploys against stale images.
- **docker build**: `COMMIT_SHA` build arg injected in `docker-publish.yml` and set as `ENV` in the backend stage of the Dockerfile.
