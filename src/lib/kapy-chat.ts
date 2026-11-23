// The Kapy chat's state, kept free of React Native so it can be tested.
//
// Two jobs:
//   1. Read the server's response defensively. The app never renders a number,
//      a category or a card it has not checked the shape of.
//   2. Track each confirmation card through its life: pending -> saving ->
//      saved (or already saved / failed / cancelled / replaced).
//
// Nothing here decides whether money is recorded. The card shows what the server
// proposed; saving happens only when the person taps Confirm and the server
// answers with the row the database stored. What "Saved" shows is that row.

export interface KapyMessage {
  role: "user" | "model";
  text: string;
}

export interface Proposal {
  requestId: string;
  amount: number;
  formatted: string;
  currency: "MYR";
  type: "expense" | "income";
  category: string;
  categoryLabel: string;
  date: string;
  dateLabel: string;
  note: string | null;
}

export interface SavedTransaction {
  id: string;
  amount: number;
  formatted: string;
  type: "expense" | "income";
  category: string;
  categoryLabel: string;
  note: string | null;
  date: string;
  dateLabel: string;
}

export type CardState =
  | "pending"
  | "saving"
  | "saved"
  | "already_saved"
  | "failed"
  | "cancelled"
  | "replaced";

export interface ProposalCard {
  data: Proposal;
  state: CardState;
  /** What the database stored, once saved. */
  saved?: SavedTransaction;
  /** Why saving failed, in words that are safe to show. */
  error?: string;
}

export interface ChatMessage extends KapyMessage {
  /** A local photo the user attached. Never sent to the chat endpoint. */
  image?: string;
  card?: ProposalCard;
}

// ── reading server responses ────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length <= max ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A proposal from the server, or null if anything about it is off. */
export function parseProposal(raw: unknown): Proposal | null {
  if (!isObj(raw)) return null;
  const requestId = str(raw.requestId, 40);
  const formatted = str(raw.formatted, 40);
  const category = str(raw.category, 40);
  const categoryLabel = str(raw.categoryLabel, 60);
  const date = str(raw.date, 10);
  const dateLabel = str(raw.dateLabel, 30);
  const note = raw.note === null || raw.note === undefined ? null : str(raw.note, 120);
  if (!requestId || !UUID.test(requestId)) return null;
  if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount <= 0) return null;
  if (raw.type !== "expense" && raw.type !== "income") return null;
  if (raw.currency !== "MYR") return null;
  if (!formatted || !category || !categoryLabel || !date || !YMD.test(date) || !dateLabel) return null;
  if (raw.note !== null && raw.note !== undefined && note === null) return null;
  return { requestId, amount: raw.amount, formatted, currency: "MYR", type: raw.type, category, categoryLabel, date, dateLabel, note };
}

export function parseSaved(raw: unknown): SavedTransaction | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id, 64);
  const formatted = str(raw.formatted, 40);
  const category = str(raw.category, 40);
  const categoryLabel = str(raw.categoryLabel, 60);
  const date = str(raw.date, 10);
  const dateLabel = str(raw.dateLabel, 30);
  if (!id || !formatted || !category || !categoryLabel || !date || !dateLabel) return null;
  if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount)) return null;
  if (raw.type !== "expense" && raw.type !== "income") return null;
  const note = raw.note === null || raw.note === undefined ? null : str(raw.note, 120);
  return { id, amount: raw.amount, formatted, type: raw.type, category, categoryLabel, note, date, dateLabel };
}

export interface ParsedReply {
  reply: string;
  context: Record<string, unknown> | null;
  proposal: Proposal | null;
}

/** The chat endpoint's response. A reply with no text is not a reply. */
export function parseReply(raw: unknown): ParsedReply | null {
  if (!isObj(raw)) return null;
  const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";
  if (!reply) return null;
  return {
    reply,
    context: isObj(raw.context) ? raw.context : null,
    proposal: parseProposal(raw.proposal),
  };
}

export type Confirmation =
  | { status: "recorded" | "already_recorded"; transaction: SavedTransaction | null }
  | null;

export function parseConfirmation(raw: unknown): Confirmation {
  if (!isObj(raw)) return null;
  if (raw.status !== "recorded" && raw.status !== "already_recorded") return null;
  return { status: raw.status, transaction: parseSaved(raw.transaction) };
}

// ── chat state transitions ──────────────────────────────────

const pendingStates: CardState[] = ["pending", "failed"];

/**
 * Appends Kapy's reply. A new proposal replaces any earlier card that has not
 * been acted on, so a correction ("tukar jadi RM20") leaves one live card, not
 * two the person could confirm by mistake.
 */
export function addReply(messages: ChatMessage[], reply: ParsedReply): ChatMessage[] {
  const next = reply.proposal
    ? messages.map((m) =>
        m.card && pendingStates.includes(m.card.state) ? { ...m, card: { ...m.card, state: "replaced" as const } } : m
      )
    : [...messages];
  const message: ChatMessage = { role: "model", text: reply.reply };
  if (reply.proposal) message.card = { data: reply.proposal, state: "pending" };
  return [...next, message];
}

export function updateCard(
  messages: ChatMessage[],
  requestId: string,
  change: (card: ProposalCard) => ProposalCard
): ChatMessage[] {
  return messages.map((m) => (m.card?.data.requestId === requestId ? { ...m, card: change(m.card) } : m));
}

/** Whether a card may be confirmed right now. Guards a double tap. */
export function canConfirm(messages: ChatMessage[], requestId: string): boolean {
  const card = messages.find((m) => m.card?.data.requestId === requestId)?.card;
  return !!card && pendingStates.includes(card.state);
}

export function canCancel(messages: ChatMessage[], requestId: string): boolean {
  return canConfirm(messages, requestId);
}

/**
 * What goes to the server as conversation history: text only. Photos and card
 * state stay on the phone; the server learns what was said, not what was shown.
 */
export function historyForServer(messages: ChatMessage[]): KapyMessage[] {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({ role: m.role, text: m.text }));
}

/** One line saying what the database actually stored. */
export function describeSaved(tx: SavedTransaction): string {
  const verb = tx.type === "income" ? "Income" : "Expense";
  return `${verb} saved: ${tx.formatted} · ${tx.categoryLabel} · ${tx.dateLabel}`;
}
