export function encodeState(payload)
{
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeState(raw)
{
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = padded + "===".slice((padded.length + 3) % 4);
  return JSON.parse(decodeURIComponent(escape(atob(normalized))));
}

export function setCookie(name, value, days)
{
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name)
{
  const match = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}
