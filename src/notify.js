/** Agent 작업 완료 → Chrome/PWA Notification. attendance-pwa와 같은 SW postMessage 패턴. */

const LS_ENABLED = "hermes-area-notify";
const ICON = `${import.meta.env.BASE_URL}icon-192.png`;

export function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyEnabled() {
  if (!notifySupported()) return false;
  if (Notification.permission !== "granted") return false;
  return localStorage.getItem(LS_ENABLED) !== "0";
}

export function setNotifyEnabled(on) {
  localStorage.setItem(LS_ENABLED, on ? "1" : "0");
}

export async function requestNotifyPermission() {
  if (!notifySupported()) return "unsupported";
  if (Notification.permission === "granted") {
    setNotifyEnabled(true);
    return "granted";
  }
  if (Notification.permission === "denied") return "denied";
  const perm = await Notification.requestPermission();
  if (perm === "granted") setNotifyEnabled(true);
  return perm;
}

export function sendNotify(title, body, tag = "hermes-agent") {
  if (!notifyEnabled()) return false;

  const payload = {
    type: "NOTIFY",
    title,
    body,
    tag,
    url: import.meta.env.BASE_URL || "./",
    icon: ICON,
  };

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(payload);
    return true;
  }

  try {
    new Notification(title, { body, icon: ICON, tag, renotify: true });
    return true;
  } catch {
    return false;
  }
}

/** running → idle (칸반 작업 끝) 때만. mock/첫 로드는 호출측에서 걸러라. */
export function notifyAgentDone(agent) {
  const name =
    agent?.def?.displayName ||
    agent?.serverData?.displayName ||
    agent?.def?.id ||
    "에이전트";
  const title = agent?.serverData?.task_title || agent?.serverData?.bubble || "";
  const body = title
    ? `${name} · ${title}`
    : `${name} 작업 완료`;
  return sendNotify("작업 완료", body, `done-${agent?.def?.id || "agent"}`);
}

export function notifyToolbarLabel() {
  if (!notifySupported()) return "알림×";
  if (Notification.permission === "denied") return "알림×";
  if (Notification.permission !== "granted") return "알림";
  return notifyEnabled() ? "알림✓" : "알림오프";
}
