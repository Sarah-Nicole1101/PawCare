import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { DateTime } from "luxon";
const enabled = process.env.PAWCARE_INTEGRATION === "1";
test(
  "Database-backed authentication, household and care workflows",
  { skip: !enabled },
  async (t) => {
    if (!process.env.DB_NAME?.endsWith("_test"))
      throw new Error(
        "Integration tests require a separate DB_NAME ending in _test.",
      );
    const { app } = await import("../server/app.js");
    const { q, pool, id } = await import("../server/db.js");
    const S = await import("../server/security.js");
    const run = crypto.randomUUID().slice(0, 8),
      password = "PawCare test passphrase " + run;
    function makeClient() {
      const agent = request.agent(app);
      let csrf;
      return {
        agent,
        async get(p) {
          const r = await agent.get("/api" + p);
          if (r.body.csrf) csrf = r.body.csrf;
          return r;
        },
        async post(p, b = {}, method = "post") {
          const r = await agent[method]("/api" + p)
            .set("Origin", process.env.APP_ORIGIN)
            .set("X-CSRF-Token", csrf || "")
            .send(b);
          if (r.body.csrf) csrf = r.body.csrf;
          return r;
        },
        async upload(p, fields, buffer, name) {
          let req = agent
            .post("/api" + p)
            .set("Origin", process.env.APP_ORIGIN)
            .set("X-CSRF-Token", csrf);
          for (const [key, value] of Object.entries(fields))
            req = req.field(key, value);
          return req.attach("file", buffer, name);
        },
        async foreign(p, body = {}) {
          return agent
            .post("/api" + p)
            .set("Origin", "https://unrelated.example")
            .set("X-CSRF-Token", csrf)
            .send(body);
        },
      };
    }
    async function register(c, name) {
      await c.get("/auth/status");
      const email = `${name.toLowerCase()}-${run}@example.test`;
      let r = await c.post("/auth/register", { name, email, password });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const mailfiles = await fs.readdir(".mail");
      let raw;
      for (const f of mailfiles) {
        const msg = await fs.readFile(".mail/" + f, "utf8");
        if (msg.includes("To: " + email) && msg.includes("#verify=")) {
          raw = msg.match(/#verify=([a-f0-9]{64})/)[1];
          break;
        }
      }
      assert(raw);
      r = await c.post("/auth/verify", { token: raw });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      r = await c.post("/auth/login", { email, password });
      assert.equal(r.body.level, "enrollment");
      r = await c.post("/auth/mfa/setup");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const secret = r.body.secret;
      r = await c.post("/auth/mfa/confirm", {
        code: S.makeTotp(secret).generate(),
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const status = await c.get("/auth/status");
      return {
        email,
        secret,
        codes: r.body.codes,
        userId: status.body.user.id,
      };
    }
    const owner = makeClient(),
      member = makeClient(),
      outsider = makeClient();
    let a, b, c, pet, med, occurrence, fileId;
    try {
      await t.test(
        "Registration, email verification, MFA enrollment and encrypted storage",
        async () => {
          a = await register(owner, "Owner");
          assert.equal(a.codes.length, 10);
          const [auth] = await q(
            "SELECT * FROM authenticators WHERE user_id=?",
            [a.userId],
          );
          assert(!auth.secret_cipher.includes(a.secret));
          const codes = await q(
            "SELECT code_hash FROM recovery_codes WHERE user_id=?",
            [a.userId],
          );
          assert(codes.every((x) => !a.codes.includes(x.code_hash)));
        },
      );
      await t.test(
        "Missing CSRF and cross-origin writes are rejected",
        async () => {
          let r = await owner.agent
            .post("/api/household")
            .send({ name: "No CSRF" });
          assert.equal(r.status, 403);
          assert.equal(
            (await owner.foreign("/household", { name: "Wrong origin" }))
              .status,
            403,
          );
        },
      );
      await t.test("An owner creates a household and a pet", async () => {
        let r = await owner.post("/household", {
          name: "Test family",
          timezone: "Asia/Manila",
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        r = await owner.post("/pets", {
          name: "Test Pet",
          species: "Dog",
          breed: "Shih Tzu",
          sex: "female",
          neutered: false,
        });
        assert.equal(r.status, 201, JSON.stringify(r.body));
        pet = r.body.id;
      });
      await t.test(
        "Family invitation is email-bound and accepted once",
        async () => {
          b = await register(member, "Member");
          c = await register(outsider, "Outsider");
          const r = await owner.post("/family/invite", { email: b.email });
          assert.equal(r.status, 200);
          const token = new URLSearchParams(
            new URL(r.body.link).hash.slice(1),
          ).get("invite");
          assert.equal(
            (await outsider.post("/household/join", { token })).status,
            400,
          );
          assert.equal(
            (await member.post("/household/join", { token })).status,
            200,
          );
          assert.equal(
            (await member.post("/household/join", { token })).status,
            400,
          );
        },
      );
      await t.test(
        "Partial login cannot access care and recovery codes are single-use",
        async () => {
          await member.post("/auth/logout");
          await member.get("/auth/status");
          assert.equal(
            (await member.post("/auth/login", { email: b.email, password }))
              .body.level,
            "password",
          );
          assert.equal((await member.get("/pets")).status, 401);
          let r = await member.post("/auth/mfa/verify", {
            code: b.codes[0],
            recovery: true,
          });
          assert.equal(r.status, 200);
          await member.post("/auth/logout");
          await member.get("/auth/status");
          await member.post("/auth/login", { email: b.email, password });
          assert.equal(
            (
              await member.post("/auth/mfa/verify", {
                code: b.codes[0],
                recovery: true,
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await member.post("/auth/mfa/verify", {
                code: b.codes[1],
                recovery: true,
              })
            ).status,
            200,
          );
        },
      );
      await t.test(
        "Family member cannot edit pets; other households cannot retrieve them",
        async () => {
          assert.equal(
            (
              await member.post("/pets", {
                name: "No",
                species: "Dog",
                sex: "unknown",
              })
            ).status,
            403,
          );
          await outsider.post("/household", {
            name: "Other family",
            timezone: "Asia/Manila",
          });
          assert.equal(
            (
              await outsider.post(
                "/pets/" + pet,
                { name: "Wrong", species: "Dog", sex: "unknown" },
                "patch",
              )
            ).status,
            404,
          );
        },
      );
      await t.test(
        "All record modules save and read typed records",
        async () => {
          const today = DateTime.now().setZone("Asia/Manila").toISODate();
          const sample = {
            health: {
              title: "Test checkup",
              record_type: "General Checkup",
              event_date: today,
            },
            vaccinations: { title: "Test vaccine", event_date: today },
            appointments: {
              title: "Test appointment",
              starts_at: new Date(Date.now() + 86400000).toISOString(),
              status: "upcoming",
            },
            weight: { weight_kg: 2.5, event_date: today },
            feeding: {
              title: "Test food",
              portion_text: "Per vet instructions",
            },
            grooming: { title: "Bath", event_date: today },
            expenses: {
              title: "Test expense",
              category: "Food",
              amount: 100,
              event_date: today,
            },
          };
          for (const [kind, data] of Object.entries(sample)) {
            const r = await member.post("/records/" + kind, {
              pet_id: pet,
              ...data,
            });
            assert.equal(r.status, 201, kind + ": " + JSON.stringify(r.body));
            const list = await owner.get("/records/" + kind);
            assert(list.body.some((x) => x.id === r.body.id));
          }
        },
      );
      await t.test(
        "Medication schedule creates idempotent occurrences",
        async () => {
          const local = DateTime.now()
            .setZone("Asia/Manila")
            .plus({ minutes: 10 });
          const r = await owner.post("/medications", {
            pet_id: pet,
            title: "TEST ONLY medicine",
            dosage: "TEST ONLY",
            route: "Oral",
            start_date: local.toISODate(),
            schedule: {
              recurrence: "daily",
              start_local: local.toFormat("yyyy-MM-dd'T'HH:mm"),
              times: [local.toFormat("HH:mm")],
            },
          });
          assert.equal(r.status, 201, JSON.stringify(r.body));
          med = r.body.id;
          let care = await owner.get("/care");
          occurrence = care.body.find((x) => x.medication_id === med);
          assert(occurrence);
          const before = care.body.length;
          care = await owner.get("/care");
          assert.equal(care.body.length, before);
        },
      );
      await t.test("Dismiss and snooze leave a dose pending", async () => {
        await q(
          "UPDATE occurrences SET due_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE id=?",
          [occurrence.id],
        );
        assert.equal(
          (
            await owner.post("/care/" + occurrence.id + "/action", {
              action: "dismiss",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await owner.post("/care/" + occurrence.id + "/action", {
              action: "snooze",
              minutes: 5,
            })
          ).status,
          200,
        );
        const [o] = await q("SELECT status FROM occurrences WHERE id=?", [
          occurrence.id,
        ]);
        assert.equal(o.status, "pending");
      });
      await t.test(
        "Concurrent family completion creates exactly one medication log",
        async () => {
          const results = await Promise.all([
            owner.post("/care/" + occurrence.id + "/action", {
              action: "done",
            }),
            member.post("/care/" + occurrence.id + "/action", {
              action: "done",
            }),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
          const [count] = await q(
            "SELECT COUNT(*) AS n FROM medication_logs WHERE occurrence_id=?",
            [occurrence.id],
          );
          assert.equal(count.n, 1);
        },
      );
      await t.test(
        "Real image upload is private; non-image content is rejected",
        async () => {
          const image = await sharp({
            create: {
              width: 12,
              height: 12,
              channels: 3,
              background: "#888888",
            },
          })
            .png()
            .toBuffer();
          let r = await owner.upload(
            "/files",
            { pet_id: pet, kind: "photo", title: "Test photo" },
            image,
            "pet.png",
          );
          assert.equal(r.status, 201, JSON.stringify(r.body));
          fileId = r.body.id;
          r = await owner.agent.get("/api/files/" + fileId + "/content");
          assert.equal(r.status, 200);
          assert.match(r.headers["content-type"], /image\/webp/);
          assert.equal(
            (await outsider.get("/files/" + fileId + "/content")).status,
            404,
          );
          r = await owner.upload(
            "/files",
            { pet_id: pet, kind: "photo", title: "Invalid" },
            Buffer.from("<script>alert(1)</script>"),
            "fake.png",
          );
          assert.equal(r.status, 400);
        },
      );
      await t.test(
        "The last household admin cannot remove or demote themselves",
        async () => {
          assert.equal(
            (
              await owner.post(
                "/family/" + a.userId,
                { role: "member" },
                "patch",
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "Used TOTP codes cannot be replayed on a new login",
        async () => {
          await member.post("/auth/logout");
          await member.get("/auth/status");
          await member.post("/auth/login", { email: b.email, password });
          const [aRow] = await q(
            "SELECT last_step FROM authenticators WHERE user_id=?",
            [b.userId],
          );
          const oldCode = S.makeTotp(b.secret).generate({
            timestamp: Number(aRow.last_step) * 30000,
          });
          assert.equal(
            (await member.post("/auth/mfa/verify", { code: oldCode })).status,
            401,
          );
          const nextCode = S.makeTotp(b.secret).generate({
            timestamp: (Number(aRow.last_step) + 1) * 30000,
          });
          assert.equal(
            (await member.post("/auth/mfa/verify", { code: nextCode })).status,
            200,
          );
        },
      );
      await t.test(
        "Authenticator replacement needs step-up and preserves the old factor until confirmation",
        async () => {
          const before = (
            await q(
              "SELECT secret_cipher FROM authenticators WHERE user_id=?",
              [b.userId],
            )
          )[0].secret_cipher;
          assert.equal(
            (
              await member.post("/auth/mfa/replace/start", {
                password: "wrong password",
                code: b.codes[2],
                recovery: true,
              })
            ).status,
            401,
          );
          let result = await member.post("/auth/mfa/replace/start", {
            password,
            code: b.codes[2],
            recovery: true,
          });
          assert.equal(result.status, 200, JSON.stringify(result.body));
          const newSecret = result.body.secret;
          assert.equal(
            (
              await member.post("/auth/mfa/replace/confirm", {
                code: "not-a-code",
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await q(
                "SELECT secret_cipher FROM authenticators WHERE user_id=?",
                [b.userId],
              )
            )[0].secret_cipher,
            before,
          );
          result = await member.post("/auth/mfa/replace/confirm", {
            code: S.makeTotp(newSecret).generate(),
          });
          assert.equal(result.status, 200, JSON.stringify(result.body));
          assert.equal(result.body.codes.length, 10);
          assert.equal(
            (
              await q(
                "SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id=? AND code_hash=?",
                [b.userId, S.digest(S.normalizeRecovery(b.codes[3]))],
              )
            )[0].n,
            0,
          );
          assert.equal((await member.get("/pets")).status, 200);
        },
      );
      await t.test(
        "Five failed MFA attempts end the partial session",
        async () => {
          await outsider.post("/auth/logout");
          await outsider.get("/auth/status");
          await outsider.post("/auth/login", { email: c.email, password });
          for (let n = 0; n < 5; n++)
            assert.equal(
              (await outsider.post("/auth/mfa/verify", { code: "bad-code" }))
                .status,
              401,
            );
          assert.equal(
            (await outsider.get("/auth/status")).body.level,
            "anonymous",
          );
        },
      );
      await t.test(
        "Schedule cancellation preserves the completed dose and stops future tasks",
        async () => {
          assert.equal(
            (await owner.post("/medications/" + med, {}, "delete")).status,
            200,
          );
          const [count] = await q(
            "SELECT COUNT(*) AS n FROM medication_logs WHERE occurrence_id=?",
            [occurrence.id],
          );
          assert.equal(count.n, 1);
          const [pending] = await q(
            "SELECT COUNT(*) AS n FROM occurrences o JOIN schedules s ON s.id=o.schedule_id WHERE s.medication_id=? AND o.status='pending' AND o.due_at>UTC_TIMESTAMP(3)",
            [med],
          );
          assert.equal(pending.n, 0);
        },
      );
      await t.test(
        "Password reset keeps MFA and invalidates authenticated sessions",
        async () => {
          let r = await owner.post("/auth/forgot", { email: a.email });
          assert.equal(r.status, 200);
          let raw;
          for (const f of await fs.readdir(".mail")) {
            const msg = await fs.readFile(".mail/" + f, "utf8");
            if (msg.includes("To: " + a.email) && msg.includes("#reset="))
              raw = msg.match(/#reset=([a-f0-9]{64})/)[1];
          }
          assert(raw);
          r = await owner.post("/auth/reset", {
            token: raw,
            password: password + " updated",
          });
          assert.equal(r.status, 200, JSON.stringify(r.body));
          assert.equal((await owner.get("/pets")).status, 401);
          await owner.get("/auth/status");
          r = await owner.post("/auth/login", {
            email: a.email,
            password: password + " updated",
          });
          assert.equal(r.body.level, "password");
          assert.equal((await owner.get("/pets")).status, 401);
        },
      );
    } finally {
      await pool.end();
    }
  },
);
