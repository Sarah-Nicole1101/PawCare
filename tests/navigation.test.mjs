import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

test("navigation clears old records, survives reload, and follows browser history", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  for (const key of ["window", "document", "localStorage", "Event"])
    globalThis[key] = dom.window[key];
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.Audio = class {
    pause() {}
    play() {
      return Promise.resolve();
    }
  };
  const errors = [];
  const pending = new Map();
  const health = [
    {
      id: "h1",
      pet_id: "p1",
      pet_name: "Milo",
      title: "Annual checkup",
      event_date: "2026-09-01",
    },
  ];
  const reminder = [
    {
      id: "r1",
      pet_id: "p1",
      pet_name: "Milo",
      title: "Water bowl",
      category: "Other",
      schedules: [
        {
          id: "s1",
          recurrence: "daily",
          local_time: "09:00",
          timezone: "Asia/Manila",
        },
      ],
    },
  ];
  globalThis.fetch = async (url) => {
    let data = [];
    if (url === "/api/auth/status")
      data = {
        level: "full",
        user: { name: "Test User" },
        household: {
          household_id: "family",
          name: "Test family",
          role: "admin",
          timezone: "Asia/Manila",
        },
      };
    else if (url === "/api/pets")
      data = [{ id: "p1", name: "Milo", species: "Dog" }];
    else if (url === "/api/records/health") data = health;
    else if (url === "/api/reminders")
      data = pending.has(url) ? await pending.get(url) : reminder;
    return { ok: true, json: async () => data };
  };
  const vite = await createServer({
    configFile: "client/vite.config.js",
    server: { middlewareMode: true },
    appType: "custom",
  });
  let root;
  const mount = async () => {
    const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
    root = createRoot(document.getElementById("root"), {
      onUncaughtError: (e) => errors.push(e),
    });
    await act(async () => root.render(React.createElement(App)));
  };
  const navigate = async (label) => {
    const button = [...document.querySelectorAll("nav button")].find(
      (b) => b.textContent === label,
    );
    assert.ok(button, `Navigation is available: ${label}`);
    await act(async () => button.click());
  };
  try {
    await mount();
    await navigate("Health records");
    assert.match(document.querySelector("main").textContent, /Annual checkup/);
    let resolveReminders;
    pending.set(
      "/api/reminders",
      new Promise((resolve) => {
        resolveReminders = resolve;
      }),
    );
    await navigate("Reminders");
    assert.equal(errors.length, 0, errors[0]?.stack);
    assert.ok(
      document.querySelector("nav"),
      "App remains mounted while loading",
    );
    assert.doesNotMatch(
      document.querySelector("main").textContent,
      /Annual checkup/,
    );
    await act(async () => resolveReminders(reminder));
    pending.clear();
    assert.match(document.querySelector("main").textContent, /Water bowl/);
    assert.equal(window.location.hash, "#page=reminders");
    await act(async () => root.unmount());
    await mount();
    assert.equal(
      document.querySelector("nav button.active").textContent,
      "Reminders",
    );
    assert.match(document.querySelector("main").textContent, /Water bowl/);
    await navigate("Health records");
    await act(async () => {
      const changed = new Promise((resolve) =>
        window.addEventListener("popstate", resolve, { once: true }),
      );
      window.history.back();
      await changed;
    });
    assert.equal(
      document.querySelector("nav button.active").textContent,
      "Reminders",
    );
    assert.equal(errors.length, 0, errors[0]?.stack);
  } finally {
    await act(async () => root?.unmount());
    await vite.close();
    dom.window.close();
  }
});
