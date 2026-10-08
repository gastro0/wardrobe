export function startChatId(update: unknown): number | null {
  if (!update || typeof update !== "object" || !("message" in update)) return null;
  const message = update.message;
  if (!message || typeof message !== "object" || !("chat" in message) || !("text" in message)) return null;
  const chat = message.chat;
  if (!chat || typeof chat !== "object" || !("id" in chat) || !("type" in chat)) return null;
  if (chat.type !== "private" || typeof chat.id !== "number" || !Number.isSafeInteger(chat.id) || chat.id <= 0) return null;
  if (typeof message.text !== "string" || !/^\/start(?:\s|$)/.test(message.text)) return null;
  return chat.id;
}
