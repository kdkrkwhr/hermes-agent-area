/** Korean one-liner messages shown when a visitor NPC enters the lobby. */
export const VISITOR_TOAST_MESSAGES = [
  "손님이 로비에 들어왔어요",
  "손님 발걸음이 지나갑니다",
  "로비에 손님이 왔어요",
  "잠시 들렀다 가는 손님이에요",
  "손님 발소리가 복도에서 들려요",
  "손님이 슬쩍 둘러보고 있어요",
  "택배는 아니고 손님이에요",
  "로비가 손님 때문에 잠시 붐볐어요",
];

/** @returns {string} a random message from the list */
export function randomVisitorToast() {
  const list = VISITOR_TOAST_MESSAGES;
  return list[Math.floor(Math.random() * list.length)];
}
