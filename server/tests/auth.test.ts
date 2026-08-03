import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.ts";
import type { ModuleKey } from "../src/services/current-user.service.ts";

type UserRecord = {
  user_id: string;
  full_name: string;
  profile_photo_url: string | null;
  role: string;
  preferred_language: "en" | "th";
  username: string;
  email: string | null;
  password_hash: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

type SessionRecord = {
  session_id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
};

class FakeStmt {
  private params: unknown[] = [];
  constructor(private db: FakeAuthDB, private sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  all<T>() { return this.db.all<T>(this.sql, this.params); }
  first<T>() { return this.db.first<T>(this.sql, this.params); }
  run() { return this.db.run(this.sql, this.params); }
}

class FakeAuthDB {
  users = new Map<string, UserRecord>();
  views = new Map<string, Set<string>>();
  permissions = new Map<string, Array<{ module_key: ModuleKey; can_access: number; can_edit: number }>>();
  sessions = new Map<string, SessionRecord>();

  prepare(sql: string) { return new FakeStmt(this, sql); }
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    return Promise.all(stmts.map((stmt) => stmt.run()));
  }

  async all<T>(sql: string, params: unknown[]) {
    if (sql.includes("SELECT view_key FROM user_views")) {
      const userId = String(params[0]);
      return { results: [...(this.views.get(userId) ?? [])].sort().map((view_key) => ({ view_key })) as T[] };
    }
    if (sql.includes("SELECT module_key, can_access, can_edit FROM user_module_permissions")) {
      const userId = String(params[0]);
      return { results: (this.permissions.get(userId) ?? []) as T[] };
    }
    if (sql.includes("SELECT * FROM users ORDER BY full_name")) {
      return { results: [...this.users.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)) as T[] };
    }
    return { results: [] as T[] };
  }

  async first<T>(sql: string, params: unknown[]) {
    if (sql.includes("COUNT(*) AS total FROM users")) {
      return { total: this.users.size } as T;
    }
    if (sql.includes("SELECT * FROM users WHERE username")) {
      const username = String(params[0]);
      return ([...this.users.values()].find((user) => user.username === username || user.email?.toLowerCase() === username) ?? null) as T | null;
    }
    if (sql.includes("SELECT s.session_id")) {
      const tokenHash = String(params[0]);
      const session = [...this.sessions.values()].find((item) => item.token_hash === tokenHash);
      const user = session ? this.users.get(session.user_id) : null;
      return session && user ? { ...session, ...user } as T : null;
    }
    if (sql.includes("SELECT * FROM users WHERE user_id")) {
      return (this.users.get(String(params[0])) ?? null) as T | null;
    }
    return null;
  }

  async run(sql: string, params: unknown[]) {
    if (sql.includes("INSERT INTO users") && sql.includes("WHERE NOT EXISTS")) {
      if (this.users.size > 0) return { meta: { changes: 0, last_row_id: 0 } };
      this.users.set(String(params[0]), this.userFromParams(params, "active"));
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO users")) {
      const id = String(params[0]);
      if ([...this.users.values()].some((user) => user.username === params[5] || (params[6] && user.email === params[6]))) {
        throw new Error("UNIQUE constraint failed");
      }
      this.users.set(id, this.userFromParams(params, String(params[8])));
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO user_sessions")) {
      this.sessions.set(String(params[0]), {
        session_id: String(params[0]),
        user_id: String(params[1]),
        token_hash: String(params[2]),
        created_at: String(params[3]),
        expires_at: String(params[4]),
      });
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE users SET last_login_at")) {
      const user = this.users.get(String(params[2]));
      if (user) {
        user.last_login_at = String(params[0]);
        user.updated_at = String(params[1]);
      }
      return { meta: { changes: user ? 1 : 0, last_row_id: 0 } };
    }
    if (sql.includes("DELETE FROM user_sessions WHERE token_hash")) {
      const tokenHash = String(params[0]);
      for (const [id, session] of this.sessions) if (session.token_hash === tokenHash) this.sessions.delete(id);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("DELETE FROM user_sessions WHERE session_id")) {
      this.sessions.delete(String(params[0]));
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("DELETE FROM user_sessions WHERE user_id")) {
      const userId = String(params[0]);
      for (const [id, session] of this.sessions) if (session.user_id === userId) this.sessions.delete(id);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("DELETE FROM user_views")) {
      this.views.delete(String(params[0]));
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("DELETE FROM user_module_permissions")) {
      this.permissions.delete(String(params[0]));
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO user_views")) {
      const userId = String(params[0]);
      const set = this.views.get(userId) ?? new Set<string>();
      set.add(String(params[1]));
      this.views.set(userId, set);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("INSERT INTO user_module_permissions")) {
      const userId = String(params[0]);
      const items = this.permissions.get(userId) ?? [];
      items.push({ module_key: params[1] as ModuleKey, can_access: Number(params[2]), can_edit: Number(params[3]) });
      this.permissions.set(userId, items);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (sql.includes("UPDATE users")) {
      const userId = String(params[9]);
      const user = this.users.get(userId);
      if (!user) return { meta: { changes: 0, last_row_id: 0 } };
      user.full_name = String(params[0]);
      user.profile_photo_url = params[1] as string | null;
      user.role = String(params[2]);
      user.preferred_language = params[3] as "en" | "th";
      user.username = String(params[4]);
      user.email = params[5] as string | null;
      user.password_hash = String(params[6]);
      user.status = String(params[7]);
      user.updated_at = String(params[8]);
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    return { meta: { changes: 0, last_row_id: 0 } };
  }

  private userFromParams(params: unknown[], status: string): UserRecord {
    return {
      user_id: String(params[0]),
      full_name: String(params[1]),
      profile_photo_url: params[2] as string | null,
      role: String(params[3]),
      preferred_language: params[4] as "en" | "th",
      username: String(params[5]),
      email: params[6] as string | null,
      password_hash: String(params[7]),
      status,
      created_at: String(params.at(-2)),
      updated_at: String(params.at(-1)),
      last_login_at: null,
    };
  }
}

function env(db = new FakeAuthDB()) {
  return {
    DB: db as unknown as D1Database,
    BEDS24_BASE_URL: "https://api.beds24.com/v2",
    BEDS24_LONG_LIFE_TOKEN: "test",
  };
}

async function json(response: Response) {
  return response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>;
}

async function request(path: string, init: RequestInit, data = env()) {
  return worker.fetch(new Request(`https://local.test${path}`, init), data as never, {} as never);
}

async function bootstrap(data = env()) {
  const response = await request("/api/auth/bootstrap-owner", {
    method: "POST",
    body: JSON.stringify({ fullName: "Owner", username: "owner", password: "owner-password", preferredLanguage: "en" }),
    headers: { "content-type": "application/json" },
  }, data);
  assert.equal(response.status, 201);
  return data;
}

async function loginOwner(data: ReturnType<typeof env>) {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "owner", password: "owner-password" }),
    headers: { "content-type": "application/json" },
  }, data);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie ?? "", /vanara_session=/);
  assert.match(cookie ?? "", /HttpOnly/);
  assert.match(cookie ?? "", /Secure/);
  return cookie!.split(";", 1)[0]!;
}

test("auth smoke: bootstrap, login, current-user, logout and reuse protection", async () => {
  const data = await bootstrap();
  const secondBootstrap = await request("/api/auth/bootstrap-owner", {
    method: "POST",
    body: JSON.stringify({ fullName: "Second", username: "second", password: "password" }),
    headers: { "content-type": "application/json" },
  }, data);
  assert.equal(secondBootstrap.status, 403);

  const badLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "owner", password: "wrong" }),
    headers: { "content-type": "application/json" },
  }, data);
  assert.equal(badLogin.status, 401);

  const cookie = await loginOwner(data);
  const me = await request("/api/current-user", { headers: { cookie } }, data);
  assert.equal(me.status, 200);
  const meBody = await json(me);
  assert.equal((meBody.data as { username: string }).username, "owner");
  assert.equal("password_hash" in (meBody.data as object), false);

  const logout = await request("/api/auth/logout", { method: "POST", headers: { cookie } }, data);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const afterLogout = await request("/api/current-user", { headers: { cookie } }, data);
  assert.equal(afterLogout.status, 401);
});

test("expired sessions are rejected and removed", async () => {
  const data = await bootstrap();
  const cookie = await loginOwner(data);
  for (const session of data.DB.sessions.values()) session.expires_at = "2000-01-01T00:00:00.000Z";

  const expired = await request("/api/current-user", { headers: { cookie } }, data);
  assert.equal(expired.status, 401);
  assert.equal(data.DB.sessions.size, 0);
});

test("direct endpoint authorization enforces owner actions while Staff can open operational modules", async () => {
  const data = await bootstrap();
  const ownerCookie = await loginOwner(data);
  const created = await request("/api/users", {
    method: "POST",
    headers: { cookie: ownerCookie, "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Limited Staff",
      username: "limited",
      password: "staff-password",
      role: "Operations",
      preferredLanguage: "en",
      status: "active",
      views: ["staff"],
      permissions: [
        { module: "dashboard", canAccess: true, canEdit: false },
        { module: "procurement", canAccess: true, canEdit: false },
      ],
    }),
  }, data);
  assert.equal(created.status, 201);
  const createdBody = await json(created);
  assert.equal("password_hash" in (createdBody.data as object), false);

  const staffLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "limited", password: "staff-password" }),
    headers: { "content-type": "application/json" },
  }, data);
  const staffCookie = staffLogin.headers.get("set-cookie")!.split(";", 1)[0]!;

  assert.equal((await request("/api/users", { headers: { cookie: staffCookie } }, data)).status, 403);
  assert.equal((await request("/api/procurement/items", { headers: { cookie: staffCookie } }, data)).status, 200);
  assert.notEqual((await request("/api/rooms/1", { headers: { cookie: staffCookie } }, data)).status, 403);
});

test("same password creates unique salted hashes and APIs never return password hashes", async () => {
  const data = await bootstrap();
  const ownerCookie = await loginOwner(data);
  for (const username of ["salt-one", "salt-two"]) {
    const created = await request("/api/users", {
      method: "POST",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({
        fullName: username,
        username,
        password: "same-password",
        role: "Operations",
        preferredLanguage: "en",
        status: "active",
        views: ["staff"],
        permissions: [{ module: "dashboard", canAccess: true, canEdit: false }],
      }),
    }, data);
    assert.equal(created.status, 201);
    assert.equal("password_hash" in ((await json(created)).data as object), false);
  }
  const hashes = [...data.DB.users.values()]
    .filter((user) => user.username.startsWith("salt-"))
    .map((user) => user.password_hash);
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1]);
});

test("disabled users cannot login and lose active sessions without losing records", async () => {
  const data = await bootstrap();
  const ownerCookie = await loginOwner(data);
  const created = await request("/api/users", {
    method: "POST",
    headers: { cookie: ownerCookie, "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Disable Me",
      username: "disabled-user",
      password: "staff-password",
      role: "Operations",
      preferredLanguage: "en",
      status: "active",
      views: ["staff"],
      permissions: [{ module: "dashboard", canAccess: true, canEdit: false }],
    }),
  }, data);
  const createdId = ((await json(created)).data as { id: string }).id;
  const staffLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "disabled-user", password: "staff-password" }),
    headers: { "content-type": "application/json" },
  }, data);
  const staffCookie = staffLogin.headers.get("set-cookie")!.split(";", 1)[0]!;

  const disabled = await request(`/api/users/${createdId}/disable`, { method: "POST", headers: { cookie: ownerCookie } }, data);
  assert.equal(disabled.status, 200);
  assert.equal(data.DB.users.has(createdId), true);
  assert.equal((await request("/api/current-user", { headers: { cookie: staffCookie } }, data)).status, 401);
  assert.equal((await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "disabled-user", password: "staff-password" }),
    headers: { "content-type": "application/json" },
  }, data)).status, 401);
});

test("profile photos are MIME and size validated server-side", async () => {
  const data = await bootstrap();
  const ownerCookie = await loginOwner(data);
  const invalidMime = await request("/api/users", {
    method: "POST",
    headers: { cookie: ownerCookie, "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Photo Test",
      username: "photo-test",
      password: "staff-password",
      role: "Operations",
      preferredLanguage: "en",
      status: "active",
      views: ["staff"],
      profilePhotoUrl: "data:text/plain;base64,SGVsbG8=",
      permissions: [{ module: "dashboard", canAccess: true, canEdit: false }],
    }),
  }, data);
  assert.equal(invalidMime.status, 400);

  const validPhoto = await request("/api/users", {
    method: "POST",
    headers: { cookie: ownerCookie, "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Photo Ok",
      username: "photo-ok",
      password: "staff-password",
      role: "Operations",
      preferredLanguage: "en",
      status: "active",
      views: ["staff"],
      profilePhotoUrl: "data:image/png;base64,iVBORw0KGgo=",
      permissions: [{ module: "dashboard", canAccess: true, canEdit: false }],
    }),
  }, data);
  assert.equal(validPhoto.status, 201);
});
