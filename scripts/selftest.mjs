import { Pool } from "@neondatabase/serverless";

const BASE = process.env.SERVER_URL ?? "http://127.0.0.1:3101";
const url =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL;
if (!url) throw new Error("No DB URL");

const pool = new Pool({ connectionString: url });

const results = [];
function check(name, cond, extra = "") {
  results.push({ name, pass: Boolean(cond), extra });
}

const uuidA = crypto.randomUUID();
const uuidB = crypto.randomUUID();
const tokenA = "selftest-" + crypto.randomUUID();
const tokenB = "selftest-" + crypto.randomUUID();
const projectId = crypto.randomUUID();
const expires = new Date(Date.now() + 86_400_000).toISOString();

async function setupUser(id, email, name, token) {
  await pool.query(
    `INSERT INTO users (id, name, email, email_verified, timezone)
     VALUES ($1,$2,$3, now(), 'UTC')`,
    [id, name, email],
  );
  await pool.query(
    `INSERT INTO sessions (session_token, user_id, expires) VALUES ($1,$2,$3)`,
    [token, id, expires],
  );
}

await setupUser(uuidA, `selftest-a-${Date.now()}@t.local`, "SelfTest A", tokenA);
await setupUser(uuidB, `selftest-b-${Date.now()}@t.local`, "SelfTest B", tokenB);

await pool.query(
  `INSERT INTO projects (id, name, emoji, owner_id, is_personal, position)
   VALUES ($1,'My Space','🏠',$2,true,'a0')`,
  [projectId, uuidA],
);
await pool.query(
  `INSERT INTO memberships (id, project_id, user_id, role) VALUES ($3,$1,$2,'owner')`,
  [projectId, uuidA, crypto.randomUUID()],
);
for (const [i, kind] of ["todo", "ideas", "work"].entries()) {
  const b = crypto.randomUUID();
  await pool.query(
    `INSERT INTO boards (id, project_id, kind, name, position) VALUES ($1,$2,$3,$4,$5)`,
    [b, projectId, kind, kind === "todo" ? "To-Do" : kind === "ideas" ? "Ideas" : "Work", String.fromCharCode(97 + i)],
  );
  const cols =
    kind === "todo"
      ? ["Backlog", "Doing", "Done"]
      : kind === "ideas"
        ? ["Raw", "Shortlist", "Promoted"]
        : ["Todo", "In Progress", "Blocked", "Done"];
  for (const [j, cname] of cols.entries()) {
    await pool.query(
      `INSERT INTO columns (id, board_id, name, position) VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), b, cname, String.fromCharCode(97 + j)],
    );
  }
}

async function get(path, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}
const cookieOf = (t) => `authjs.session-token=${t}`;

// 1. Anonymous protection
{
  const r = await get("/today");
  check("anon /today redirects to signin", r.status === 307 && r.location?.includes("/signin"), `${r.status}`);
}

// 2. Authenticated shell routes for user A
{
  const c = cookieOf(tokenA);
  const today = await get("/today", c);
  check("A /today 200", today.status === 200, `${today.status}`);

  const boards = await get("/boards", c);
  check(
    "A /boards shows My Space",
    boards.status === 200 && boards.body.includes("My Space"),
    `${boards.status}`,
  );

  const board = await get(`/p/${projectId}/b/todo`, c);
  check(
    "A board renders seeded columns",
    board.status === 200 &&
      board.body.includes("Backlog") &&
      board.body.includes("Doing") &&
      board.body.includes("Done"),
    `${board.status}`,
  );

  const projRoot = await get(`/p/${projectId}`, c);
  check(
    "A project root redirects to todo board",
    projRoot.status === 307 && projRoot.location?.includes("/b/todo"),
    `${projRoot.status} ${projRoot.location ?? ""}`,
  );

  const members = await get(`/p/${projectId}/members`, c);
  check(
    "A members page lists SelfTest A",
    members.status === 200 && members.body.includes("SelfTest A") && members.body.includes("owner"),
    `${members.status}`,
  );

  const settings = await get(`/p/${projectId}/settings`, c);
  check("A settings 200 with danger zone", settings.status === 200 && settings.body.includes("Danger zone"), `${settings.status}`);

  const trash = await get("/trash", c);
  check("A trash empty state", trash.status === 200 && trash.body.includes("Trash is empty"), `${trash.status}`);

  const learn = await get("/learn", c);
  check("A /learn pipeline renders", learn.status === 200 && learn.body.includes("Want to learn"), `${learn.status}`);

  const money = await get("/money", c);
  check("A /money renders month view", money.status === 200 && money.body.includes("Spent this month"), `${money.status}`);

  const cats = await pool.query(
    `SELECT count(*)::int AS n FROM expense_categories WHERE user_id=$1`,
    [uuidA],
  );
  check("/money lazy-seeded 7 categories", cats.rows[0].n === 7, `count=${cats.rows[0].n}`);

  const search = await get(`/p/${projectId}/search?q=zzz`, c);
  check("A project search 200 no matches", search.status === 200 && search.body.includes("No matches"), `${search.status}`);

  const weekly = await get("/weekly", c);
  check("A /weekly renders review", weekly.status === 200 && weekly.body.includes("Weekly review"), `${weekly.status}`);

  const shutdown = await get("/shutdown", c);
  check("A /shutdown renders ritual", shutdown.status === 200 && shutdown.body.includes("Shutdown"), `${shutdown.status}`);

  const wrapped = await get("/wrapped", c);
  check("A /wrapped renders", wrapped.status === 200 && wrapped.body.includes("Life Wrapped"), `${wrapped.status}`);
}

// 3. IDOR: user B must get no project data anywhere in A's project.
//    NOTE: routes with a loading.tsx stream their shell first, so Next
//    flushes HTTP 200 and renders the not-found UI in-stream. What must
//    hold for authz is: the stranger sees the not-found boundary and
//    never the project's content.
{
  const c = cookieOf(tokenB);
  const idorTargets = [
    [`/p/${projectId}/b/todo`, "Backlog"],
    [`/p/${projectId}`, "/b/todo"],
    [`/p/${projectId}/settings`, "Danger zone"],
    [`/p/${projectId}/members`, "SelfTest A"],
    [`/p/${projectId}/search?q=x`, null],
  ];
  for (const [path, leaked] of idorTargets) {
    const r = await get(path, c);
    const denied =
      r.status === 404 || /404|not found|not-found/i.test(r.body);
    const clean = !leaked || !r.body.includes(leaked);
    check(
      `B ${path} -> denied & no leak`,
      denied && clean,
      `${r.status} denied=${denied} clean=${clean}`,
    );
  }
}

// 4. Health
{
  const r = await get("/api/health");
  check("health ok db up", r.status === 200 && r.body.includes('"db":"up"'), `${r.status}`);
}

// cleanup
await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId]);
for (const id of [uuidA, uuidB]) {
  await pool.query(`DELETE FROM users WHERE id=$1`, [id]);
}
await pool.end();

let failed = 0;
console.log("\n=== SELF TEST RESULTS ===");
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${!r.pass ? `  (${r.extra})` : ""}`);
}
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
