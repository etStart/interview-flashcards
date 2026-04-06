import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import rawBank from "../all_questions.json";
import "./app.css";

type ReviewLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ReviewResult = "good" | "blur" | "bad";
type StudyMode = "due" | "all" | "unseen" | "forgotten" | "random";

type QuestionCard = {
  id: string;
  q: string;
  a: string;
  cn?: string;
  tag?: string;
};

type Category = {
  id: string;
  name: string;
  description: string;
  cards: QuestionCard[];
};

type Group = {
  id: string;
  name: string;
  categoryIds: string[];
};

type ProgressRecord = {
  cardId: string;
  level: ReviewLevel;
  lastReviewAt: string | null;
  nextReviewAt: string | null;
  editedAnswer: string | null;
  updatedAt: string;
};

type ProgressMap = Record<string, ProgressRecord>;

type SyncInfo = {
  mode: "local" | "cloud";
  configured: boolean;
  userEmail: string | null;
  lastSyncedAt: string | null;
  message: string | null;
};

type DeckEntry = {
  card: QuestionCard;
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
};

type StudyAnswer = {
  cardId: string;
  result: ReviewResult;
  nextLevel: ReviewLevel;
};

type StudySession = {
  groupId: string;
  groupName: string;
  mode: StudyMode;
  cards: DeckEntry[];
  index: number;
  answers: StudyAnswer[];
};

type BackupFile = {
  version: 1;
  exportedAt: string;
  progress: ProgressRecord[];
};

type RawBank = {
  groups: Group[];
  categories: Array<
    Omit<Category, "cards"> & {
      cards: Array<QuestionCard & { mastery?: number }>;
    }
  >;
};

type UserProgressRow = {
  user_id: string;
  card_id: string;
  level: number;
  last_review_at: string | null;
  next_review_at: string | null;
  edited_answer: string | null;
  updated_at: string;
};

const STORAGE_KEY = "interview-flashcards.progress.v1";
const SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 9999] as const;
const MODE_LABELS: Record<StudyMode, string> = {
  due: "Due now",
  all: "All cards",
  unseen: "Unseen",
  forgotten: "Level 1 only",
  random: "Random 10",
};
const EMPTY_SYNC_INFO: SyncInfo = {
  mode: "local",
  configured: false,
  userEmail: null,
  lastSyncedAt: null,
  message: "Loading...",
};

const questionBank = (() => {
  const source = rawBank as RawBank;
  return {
    groups: source.groups,
    categories: source.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      cards: category.cards.map((card) => ({
        id: card.id,
        q: card.q,
        a: card.a,
        cn: card.cn ?? "",
        tag: card.tag ?? "",
      })),
    })),
  };
})();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseKey);
const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function clampLevel(level: number): ReviewLevel {
  return Math.max(0, Math.min(7, Math.round(level))) as ReviewLevel;
}

function createEmptyProgress(cardId: string): ProgressRecord {
  return {
    cardId,
    level: 0,
    lastReviewAt: null,
    nextReviewAt: null,
    editedAnswer: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeProgress(cardId: string, partial?: Partial<ProgressRecord> | null): ProgressRecord {
  const base = createEmptyProgress(cardId);
  return {
    ...base,
    ...partial,
    cardId,
    level: clampLevel(partial?.level ?? base.level),
    lastReviewAt: partial?.lastReviewAt ?? null,
    nextReviewAt: partial?.nextReviewAt ?? null,
    editedAnswer: partial?.editedAnswer ?? null,
    updatedAt: partial?.updatedAt ?? base.updatedAt,
  };
}

function getProgressRecord(cardId: string, progressMap: ProgressMap): ProgressRecord {
  return normalizeProgress(cardId, progressMap[cardId]);
}

function reviewCard(progress: ProgressRecord, result: ReviewResult, now = new Date()): ProgressRecord {
  let nextLevel = progress.level;

  if (result === "good") {
    nextLevel = clampLevel(progress.level + 1);
  } else if (result === "blur") {
    nextLevel = clampLevel(Math.max(progress.level, 1));
  } else {
    nextLevel = 1;
  }

  return {
    ...progress,
    level: nextLevel,
    lastReviewAt: now.toISOString(),
    nextReviewAt:
      nextLevel === 7
        ? null
        : new Date(now.getTime() + SRS_INTERVALS[nextLevel] * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString(),
  };
}

function isDue(progress: ProgressRecord, now = new Date()): boolean {
  if (progress.level === 0) return true;
  if (progress.level === 7) return false;
  if (!progress.nextReviewAt) return true;
  return new Date(progress.nextReviewAt).getTime() <= now.getTime();
}

function getEditedAnswer(card: QuestionCard, progress: ProgressRecord): string {
  const edited = progress.editedAnswer?.trim();
  return edited ? edited : card.a;
}

function mergeProgressMaps(left: ProgressMap, right: ProgressMap): ProgressMap {
  const merged: ProgressMap = { ...left };

  for (const [cardId, record] of Object.entries(right)) {
    const current = merged[cardId];
    if (!current) {
      merged[cardId] = normalizeProgress(cardId, record);
      continue;
    }

    const currentTime = Date.parse(current.updatedAt || new Date(0).toISOString());
    const incomingTime = Date.parse(record.updatedAt || new Date(0).toISOString());
    merged[cardId] =
      incomingTime >= currentTime
        ? normalizeProgress(cardId, record)
        : normalizeProgress(cardId, current);
  }

  return merged;
}

function formatNextReview(dateIso: string | null): string {
  if (!dateIso) return "Mastered";
  const delta = Date.parse(dateIso) - Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (delta <= day && delta >= 0) return "Tomorrow";
  return `${Math.max(1, Math.round(delta / day))} days`;
}

function describeResultPreview(progress: ProgressRecord, result: ReviewResult): string {
  const next = reviewCard(progress, result);
  return `Lv${next.level} / ${formatNextReview(next.nextReviewAt)}`;
}

function readLocalProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressMap;
    const normalized: ProgressMap = {};
    for (const [cardId, record] of Object.entries(parsed)) {
      normalized[cardId] = normalizeProgress(cardId, record);
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeLocalProgress(progressMap: ProgressMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progressMap));
}

async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

function localSyncInfo(message: string | null, userEmail: string | null = null): SyncInfo {
  return {
    mode: "local",
    configured: hasSupabaseEnv,
    userEmail,
    lastSyncedAt: null,
    message,
  };
}

function rowsToProgressMap(rows: UserProgressRow[]): ProgressMap {
  return rows.reduce<ProgressMap>((accumulator, row) => {
    accumulator[row.card_id] = normalizeProgress(row.card_id, {
      cardId: row.card_id,
      level: clampLevel(row.level),
      lastReviewAt: row.last_review_at,
      nextReviewAt: row.next_review_at,
      editedAnswer: row.edited_answer,
      updatedAt: row.updated_at,
    });
    return accumulator;
  }, {});
}

function progressToRows(progressMap: ProgressMap, userId: string): UserProgressRow[] {
  return Object.values(progressMap).map((record) => ({
    user_id: userId,
    card_id: record.cardId,
    level: record.level,
    last_review_at: record.lastReviewAt,
    next_review_at: record.nextReviewAt,
    edited_answer: record.editedAnswer,
    updated_at: record.updatedAt,
  }));
}

async function fetchRemoteProgress(session: Session): Promise<ProgressMap> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("user_progress")
    .select("user_id, card_id, level, last_review_at, next_review_at, edited_answer, updated_at")
    .eq("user_id", session.user.id);
  if (error) throw error;
  return rowsToProgressMap((data ?? []) as UserProgressRow[]);
}

async function pushRemoteProgress(progressMap: ProgressMap, session: Session): Promise<void> {
  if (!supabase) return;
  const rows = progressToRows(progressMap, session.user.id);
  if (rows.length === 0) return;
  const { error } = await supabase.from("user_progress").upsert(rows, {
    onConflict: "user_id,card_id",
  });
  if (error) throw error;
}

async function hydrateProgress(): Promise<{ progressMap: ProgressMap; syncInfo: SyncInfo }> {
  const localProgress = readLocalProgress();
  const session = await getSession();

  if (!session) {
    return {
      progressMap: localProgress,
      syncInfo: localSyncInfo(
        hasSupabaseEnv ? "Local mode. Sign in to enable sync." : "Local mode. Supabase is not configured.",
      ),
    };
  }

  try {
    const remoteProgress = await fetchRemoteProgress(session);
    const merged = mergeProgressMaps(localProgress, remoteProgress);
    writeLocalProgress(merged);
    if (Object.keys(merged).length > 0) {
      await pushRemoteProgress(merged, session);
    }
    return {
      progressMap: merged,
      syncInfo: {
        mode: "cloud",
        configured: true,
        userEmail: session.user.email ?? null,
        lastSyncedAt: new Date().toISOString(),
        message: "Cloud sync is active.",
      },
    };
  } catch {
    return {
      progressMap: localProgress,
      syncInfo: localSyncInfo("Cloud read failed. Falling back to local data.", session.user.email ?? null),
    };
  }
}

async function saveProgressRecord(record: ProgressRecord): Promise<{ syncInfo: SyncInfo }> {
  const nextMap = {
    ...readLocalProgress(),
    [record.cardId]: normalizeProgress(record.cardId, record),
  };
  writeLocalProgress(nextMap);

  const session = await getSession();
  if (!session) {
    return {
      syncInfo: localSyncInfo(
        hasSupabaseEnv ? "Saved locally. It will sync after sign in." : "Saved locally.",
      ),
    };
  }

  try {
    await pushRemoteProgress({ [record.cardId]: record }, session);
    return {
      syncInfo: {
        mode: "cloud",
        configured: true,
        userEmail: session.user.email ?? null,
        lastSyncedAt: new Date().toISOString(),
        message: "Synced to cloud.",
      },
    };
  } catch {
    return {
      syncInfo: localSyncInfo("Saved locally, but cloud sync failed.", session.user.email ?? null),
    };
  }
}
function buildBackup(progressMap: ProgressMap): BackupFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: Object.values(progressMap),
  };
}

function parseBackup(raw: string): ProgressMap {
  const parsed = JSON.parse(raw) as Partial<BackupFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.progress)) {
    throw new Error("Invalid backup file.");
  }

  return parsed.progress.reduce<ProgressMap>((accumulator, record) => {
    if (!record.cardId) return accumulator;
    accumulator[record.cardId] = normalizeProgress(record.cardId, record);
    return accumulator;
  }, {});
}

async function mergeImportedBackup(imported: ProgressMap): Promise<{
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
}> {
  const merged = mergeProgressMaps(readLocalProgress(), imported);
  writeLocalProgress(merged);

  const session = await getSession();
  if (!session) {
    return {
      progressMap: merged,
      syncInfo: localSyncInfo("Backup imported into local storage."),
    };
  }

  try {
    await pushRemoteProgress(merged, session);
    return {
      progressMap: merged,
      syncInfo: {
        mode: "cloud",
        configured: true,
        userEmail: session.user.email ?? null,
        lastSyncedAt: new Date().toISOString(),
        message: "Backup imported and synced to cloud.",
      },
    };
  } catch {
    return {
      progressMap: merged,
      syncInfo: localSyncInfo("Backup imported locally, but cloud sync failed.", session.user.email ?? null),
    };
  }
}

async function sendMagicLink(email: string): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) throw error;
  return "Magic link sent.";
}

async function signOutCloud(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function forceCloudSync(progressMap: ProgressMap): Promise<{
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
}> {
  const session = await getSession();
  if (!session) {
    return {
      progressMap,
      syncInfo: localSyncInfo("Not signed in. Sync is unavailable."),
    };
  }

  const remoteProgress = await fetchRemoteProgress(session);
  const merged = mergeProgressMaps(progressMap, remoteProgress);
  writeLocalProgress(merged);
  await pushRemoteProgress(merged, session);

  return {
    progressMap: merged,
    syncInfo: {
      mode: "cloud",
      configured: true,
      userEmail: session.user.email ?? null,
      lastSyncedAt: new Date().toISOString(),
      message: "Manual sync finished.",
    },
  };
}

function shuffle<T>(items: T[]): T[] {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function buildDeck(group: Group, categoryIds: string[], mode: StudyMode, progressMap: ProgressMap): DeckEntry[] {
  const categories = questionBank.categories.filter(
    (category) => group.categoryIds.includes(category.id) && categoryIds.includes(category.id),
  );

  const entries = categories.flatMap((category) =>
    category.cards.map((card) => ({
      card,
      categoryId: category.id,
      categoryName: category.name,
      groupId: group.id,
      groupName: group.name,
    })),
  );

  const filtered = entries.filter((entry) => {
    const progress = getProgressRecord(entry.card.id, progressMap);
    if (mode === "due") return isDue(progress);
    if (mode === "unseen") return progress.level === 0;
    if (mode === "forgotten") return progress.level === 1;
    return true;
  });

  return mode === "random" ? shuffle(filtered).slice(0, 10) : filtered;
}

function HomeView(props: {
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
  onOpenGroup: (group: Group) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onOpenCloud: () => void;
}) {
  const { progressMap, syncInfo, onOpenGroup, onExportBackup, onImportBackup, onOpenCloud } = props;
  const allCards = questionBank.categories.flatMap((category) => category.cards);
  const totalCards = allCards.length;
  const dueCount = allCards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length;
  const reviewedCount = allCards.filter((card) => getProgressRecord(card.id, progressMap).level > 0).length;
  const masteredCount = allCards.filter((card) => getProgressRecord(card.id, progressMap).level === 7).length;
  const fluency =
    totalCards === 0
      ? 0
      : Math.round(
          (allCards.reduce((sum, card) => sum + getProgressRecord(card.id, progressMap).level, 0) /
            (totalCards * 7)) *
            100,
        );

  return (
    <div className="screen">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Interview Flashcards</span>
          <h1>Your bank. Your pace.</h1>
          <p>Question content stays in JSON. Progress starts local and can sync to Supabase later.</p>
        </div>

        <div className="hero-panel">
          <div className="sync-badge" data-mode={syncInfo.mode}>
            <span>{syncInfo.mode === "cloud" ? "Cloud" : "Local"}</span>
            <strong>{syncInfo.message ?? "Ready"}</strong>
          </div>

          <div className="hero-stats">
            <div>
              <span>Due today</span>
              <strong>{dueCount}</strong>
            </div>
            <div>
              <span>Reviewed</span>
              <strong>
                {reviewedCount}/{totalCards}
              </strong>
            </div>
            <div>
              <span>Level 7</span>
              <strong>{masteredCount}</strong>
            </div>
          </div>

          <div className="progress-block">
            <div className="progress-label">
              <span>Overall fluency</span>
              <strong>{fluency}%</strong>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${fluency}%` }} />
            </div>
          </div>
        </div>
      </header>

      <section className="toolbar">
        <button className="secondary-button" onClick={onExportBackup}>
          Export backup
        </button>
        <button className="secondary-button" onClick={onImportBackup}>
          Import backup
        </button>
        <button className="primary-button" onClick={onOpenCloud}>
          Cloud settings
        </button>
      </section>

      <section className="group-grid">
        {questionBank.groups.map((group) => {
          const categories = questionBank.categories.filter((category) => group.categoryIds.includes(category.id));
          const cards = categories.flatMap((category) => category.cards);
          const groupDueCount = cards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length;
          const groupReviewed = cards.filter((card) => getProgressRecord(card.id, progressMap).level > 0).length;

          return (
            <article className="group-card" key={group.id}>
              <div className="group-card-head">
                <div>
                  <span className="group-name">{group.name}</span>
                  <p>{categories.map((category) => category.name).join(" / ")}</p>
                </div>
                <span className="pill">{cards.length} cards</span>
              </div>

              <div className="group-card-meta">
                <div>
                  <span>Due</span>
                  <strong>{groupDueCount}</strong>
                </div>
                <div>
                  <span>Reviewed</span>
                  <strong>{groupReviewed}</strong>
                </div>
                <div>
                  <span>Categories</span>
                  <strong>{categories.length}</strong>
                </div>
              </div>

              <button className="primary-button full-width" onClick={() => onOpenGroup(group)}>
                Open group
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function GroupView(props: {
  group: Group;
  progressMap: ProgressMap;
  onBack: () => void;
  onStart: (categoryIds: string[], mode: StudyMode) => void;
}) {
  const { group, progressMap, onBack, onStart } = props;
  const categories = questionBank.categories.filter((category) => group.categoryIds.includes(category.id));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(categories.map((category) => category.id));

  useEffect(() => {
    setSelectedCategoryIds(categories.map((category) => category.id));
  }, [group.id]);

  const selectedCards = categories
    .filter((category) => selectedCategoryIds.includes(category.id))
    .flatMap((category) => category.cards);

  const modeCounts = {
    due: selectedCards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length,
    all: selectedCards.length,
    unseen: selectedCards.filter((card) => getProgressRecord(card.id, progressMap).level === 0).length,
    forgotten: selectedCards.filter((card) => getProgressRecord(card.id, progressMap).level === 1).length,
    random: Math.min(10, selectedCards.length),
  };

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId],
    );
  }

  return (
    <div className="screen">
      <button className="ghost-button" onClick={onBack}>
        Back home
      </button>

      <header className="group-header">
        <div>
          <span className="eyebrow">Group</span>
          <h2>{group.name}</h2>
          <p>Pick a range first, then start the session.</p>
        </div>
        <span className="pill">{selectedCards.length} cards selected</span>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h3>Range</h3>
          <button className="text-button" onClick={() => setSelectedCategoryIds(categories.map((category) => category.id))}>
            Select all
          </button>
        </div>

        <div className="category-list">
          {categories.map((category) => {
            const dueCount = category.cards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length;
            const selected = selectedCategoryIds.includes(category.id);

            return (
              <button
                className={`category-chip ${selected ? "selected" : ""}`}
                key={category.id}
                onClick={() => toggleCategory(category.id)}
              >
                <strong>{category.name}</strong>
                <span>
                  {category.cards.length} cards / {dueCount} due
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Modes</h3>
          <span className="pill subtle">{selectedCards.length} cards in scope</span>
        </div>

        <div className="mode-grid">
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "due")}>
            <span>Due now</span>
            <strong>{modeCounts.due}</strong>
          </button>
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "all")}>
            <span>All cards</span>
            <strong>{modeCounts.all}</strong>
          </button>
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "unseen")}>
            <span>Unseen</span>
            <strong>{modeCounts.unseen}</strong>
          </button>
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "forgotten")}>
            <span>Level 1 only</span>
            <strong>{modeCounts.forgotten}</strong>
          </button>
          <button className="mode-card wide" onClick={() => onStart(selectedCategoryIds, "random")}>
            <span>Random 10</span>
            <strong>{modeCounts.random}</strong>
          </button>
        </div>
      </section>
    </div>
  );
}
function StudyView(props: {
  session: StudySession;
  progressMap: ProgressMap;
  onBack: () => void;
  onRate: (card: DeckEntry, result: ReviewResult) => void;
  onSaveAnswer: (card: DeckEntry, answer: string | null) => Promise<void>;
}) {
  const { session, progressMap, onBack, onRate, onSaveAnswer } = props;
  const currentCard = session.cards[session.index];
  const currentProgress = currentCard ? getProgressRecord(currentCard.card.id, progressMap) : null;
  const [isFlipped, setIsFlipped] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftAnswer, setDraftAnswer] = useState(
    currentCard && currentProgress ? getEditedAnswer(currentCard.card, currentProgress) : "",
  );

  useEffect(() => {
    if (!currentCard || !currentProgress) return;
    setIsFlipped(false);
    setIsEditing(false);
    setDraftAnswer(getEditedAnswer(currentCard.card, currentProgress));
  }, [currentCard?.card.id, currentProgress?.editedAnswer]);

  if (!currentCard || !currentProgress) {
    const summary = session.answers.reduce(
      (accumulator, answer) => {
        accumulator[answer.result] += 1;
        return accumulator;
      },
      { good: 0, blur: 0, bad: 0 },
    );

    return (
      <div className="screen">
        <button className="ghost-button" onClick={onBack}>
          Back home
        </button>

        <section className="completion-card">
          <span className="eyebrow">Session Complete</span>
          <h2>{session.groupName} finished</h2>
          <p>The round is done. Progress is already saved.</p>

          <div className="completion-grid">
            <div>
              <span>Got it</span>
              <strong>{summary.good}</strong>
            </div>
            <div>
              <span>Fuzzy</span>
              <strong>{summary.blur}</strong>
            </div>
            <div>
              <span>Forgot</span>
              <strong>{summary.bad}</strong>
            </div>
          </div>

          <button className="primary-button" onClick={onBack}>
            Back home
          </button>
        </section>
      </div>
    );
  }

  const progressPercent = Math.round((session.index / session.cards.length) * 100);

  async function handleSave() {
    const cleaned = draftAnswer.trim();
    const nextAnswer = cleaned === currentCard.card.a.trim() ? null : cleaned;
    setIsSaving(true);
    try {
      await onSaveAnswer(currentCard, nextAnswer);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="screen study-screen">
      <button className="ghost-button" onClick={onBack}>
        End session
      </button>

      <header className="study-header">
        <div>
          <span className="eyebrow">{session.groupName}</span>
          <h2>
            {session.index + 1} / {session.cards.length}
          </h2>
        </div>
        <div className="study-meta">
          <span className="pill">{currentCard.categoryName}</span>
          <span className="pill subtle">Lv{currentProgress.level}</span>
        </div>
      </header>

      <div className="progress-bar large">
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <section className={`flashcard ${isFlipped ? "flipped" : ""}`}>
        <button className="card-face card-front" onClick={() => setIsFlipped(true)}>
          <span className="card-kicker">Question</span>
          <h3>{currentCard.card.q}</h3>
          <span className="card-hint">Tap to reveal the answer</span>
        </button>

        <div className="card-face card-back">
          <div className="card-back-head">
            <span className="card-kicker">Answer</span>
            <button className="text-button" onClick={() => setIsFlipped(false)}>
              Show question
            </button>
          </div>

          {currentCard.card.cn ? <p className="translation">{currentCard.card.cn}</p> : null}

          {isEditing ? (
            <textarea
              className="answer-editor"
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
            />
          ) : (
            <pre className="answer-text">{getEditedAnswer(currentCard.card, currentProgress)}</pre>
          )}

          <div className="answer-meta">
            <span>Next review</span>
            <strong>{formatNextReview(currentProgress.nextReviewAt)}</strong>
          </div>

          <div className="edit-actions">
            {isEditing ? (
              <>
                <button className="secondary-button" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button className="secondary-button" onClick={() => setDraftAnswer(currentCard.card.a)}>
                  Reset to original
                </button>
                <button className="primary-button" disabled={isSaving} onClick={handleSave}>
                  {isSaving ? "Saving..." : "Save answer"}
                </button>
              </>
            ) : (
              <button className="secondary-button" onClick={() => setIsEditing(true)}>
                Edit answer
              </button>
            )}
          </div>
        </div>
      </section>

      {isFlipped && !isEditing ? (
        <section className="review-panel">
          <h3>Score this card</h3>
          <div className="review-grid">
            <button className="review-button danger" onClick={() => onRate(currentCard, "bad")}>
              <span>Forgot</span>
              <strong>{describeResultPreview(currentProgress, "bad")}</strong>
            </button>
            <button className="review-button warn" onClick={() => onRate(currentCard, "blur")}>
              <span>Fuzzy</span>
              <strong>{describeResultPreview(currentProgress, "blur")}</strong>
            </button>
            <button className="review-button success" onClick={() => onRate(currentCard, "good")}>
              <span>Got it</span>
              <strong>{describeResultPreview(currentProgress, "good")}</strong>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function CloudPanel(props: {
  open: boolean;
  syncInfo: SyncInfo;
  onClose: () => void;
  onSendMagicLink: (email: string) => Promise<string>;
  onSignOut: () => Promise<void>;
  onForceSync: () => Promise<void>;
}) {
  const { open, syncInfo, onClose, onSendMagicLink, onSignOut, onForceSync } = props;
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!open) return null;

  async function handleSendLink() {
    setIsBusy(true);
    try {
      const nextMessage = await onSendMagicLink(email);
      setMessage(nextMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    setIsBusy(true);
    try {
      await onSignOut();
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleForceSync() {
    setIsBusy(true);
    try {
      await onForceSync();
      setMessage("Manual sync finished.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="modal-shell" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Cloud settings">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Supabase</span>
            <h3>Cloud settings</h3>
          </div>
          <button className="ghost-button small" onClick={onClose}>
            Close
          </button>
        </div>

        {!syncInfo.configured ? (
          <div className="cloud-block">
            <p>Supabase is not configured yet. Put these values into `.env.local` first:</p>
            <code>VITE_SUPABASE_URL</code>
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
        ) : syncInfo.userEmail ? (
          <div className="cloud-block">
            <p>Signed in as: {syncInfo.userEmail}</p>
            <p>{syncInfo.message ?? "Cloud sync is ready."}</p>
            <div className="modal-actions">
              <button className="secondary-button" disabled={isBusy} onClick={handleForceSync}>
                Sync now
              </button>
              <button className="secondary-button" disabled={isBusy} onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="cloud-block">
            <p>Enter your email and send a magic link for this device.</p>
            <input
              className="text-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="modal-actions">
              <button
                className="primary-button"
                disabled={isBusy || email.trim().length === 0}
                onClick={handleSendLink}
              >
                {isBusy ? "Sending..." : "Send magic link"}
              </button>
            </div>
          </div>
        )}

        {message ? <p className="modal-message">{message}</p> : null}
      </div>
    </div>
  );
}

export default function App() {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [session, setSession] = useState<StudySession | null>(null);
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  const [syncInfo, setSyncInfo] = useState<SyncInfo>(EMPTY_SYNC_INFO);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const hydrated = await hydrateProgress();
      if (cancelled) return;
      setProgressMap(hydrated.progressMap);
      setSyncInfo(hydrated.syncInfo);
      setIsHydrating(false);
    }

    void boot();

    if (!supabase) {
      return () => {
        cancelled = true;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      const hydrated = await hydrateProgress();
      if (cancelled) return;
      setProgressMap(hydrated.progressMap);
      setSyncInfo(hydrated.syncInfo);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function persistRecord(record: ProgressRecord) {
    setProgressMap((current) => ({ ...current, [record.cardId]: record }));
    const { syncInfo: nextSync } = await saveProgressRecord(record);
    setSyncInfo(nextSync);
  }
  function startStudy(categoryIds: string[], mode: StudyMode) {
    if (!selectedGroup) return;
    if (categoryIds.length === 0) {
      setToast("Pick at least one category.");
      return;
    }

    const cards = buildDeck(selectedGroup, categoryIds, mode, progressMap);
    if (cards.length === 0) {
      setToast("No cards match this filter.");
      return;
    }

    setSession({
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      mode,
      cards,
      index: 0,
      answers: [],
    });
  }

  async function handleRate(card: DeckEntry, result: ReviewResult) {
    const next = reviewCard(getProgressRecord(card.card.id, progressMap), result);
    await persistRecord(next);

    setSession((current) => {
      if (!current) return current;
      return {
        ...current,
        index: current.index + 1,
        answers: [...current.answers, { cardId: card.card.id, result, nextLevel: next.level }],
      };
    });
  }

  async function handleSaveAnswer(card: DeckEntry, answer: string | null) {
    const current = getProgressRecord(card.card.id, progressMap);
    await persistRecord({
      ...current,
      editedAnswer: answer,
      updatedAt: new Date().toISOString(),
    });
    setToast("Answer saved.");
  }

  function handleExportBackup() {
    const payload = buildBackup(progressMap);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `flashcards-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Backup exported.");
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = parseBackup(await file.text());
      const merged = await mergeImportedBackup(imported);
      setProgressMap(merged.progressMap);
      setSyncInfo(merged.syncInfo);
      setToast("Backup imported.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Backup import failed.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleForceSync() {
    const synced = await forceCloudSync(progressMap);
    setProgressMap(synced.progressMap);
    setSyncInfo(synced.syncInfo);
    setToast("Sync done.");
  }

  if (isHydrating) {
    return (
      <main className="app-shell loading-shell">
        <div className="loading-card">
          <span className="eyebrow">Booting</span>
          <h1>Loading your cards...</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <input hidden ref={importRef} type="file" accept="application/json" onChange={handleImportFile} />

      {!selectedGroup && !session ? (
        <HomeView
          progressMap={progressMap}
          syncInfo={syncInfo}
          onOpenGroup={setSelectedGroup}
          onExportBackup={handleExportBackup}
          onImportBackup={() => importRef.current?.click()}
          onOpenCloud={() => setCloudOpen(true)}
        />
      ) : null}

      {selectedGroup && !session ? (
        <GroupView
          group={selectedGroup}
          progressMap={progressMap}
          onBack={() => setSelectedGroup(null)}
          onStart={startStudy}
        />
      ) : null}

      {session ? (
        <StudyView
          session={session}
          progressMap={progressMap}
          onBack={() => {
            setSession(null);
            setSelectedGroup(null);
          }}
          onRate={handleRate}
          onSaveAnswer={handleSaveAnswer}
        />
      ) : null}

      <CloudPanel
        open={cloudOpen}
        syncInfo={syncInfo}
        onClose={() => setCloudOpen(false)}
        onSendMagicLink={sendMagicLink}
        onSignOut={async () => {
          await signOutCloud();
          const hydrated = await hydrateProgress();
          setProgressMap(hydrated.progressMap);
          setSyncInfo(hydrated.syncInfo);
        }}
        onForceSync={handleForceSync}
      />

      {session ? (
        <div className="floating-mode-badge">
          <span>{session.groupName}</span>
          <strong>{MODE_LABELS[session.mode]}</strong>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </main>
  );
}
