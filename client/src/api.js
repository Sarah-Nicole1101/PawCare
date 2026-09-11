let csrf = "";
export async function api(path, { method = "GET", body } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(multipart ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (data.csrf) csrf = data.csrf;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}
