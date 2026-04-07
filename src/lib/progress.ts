import { SRS_INTERVALS, STORAGE_KEY } from "./constants";
import type { BackupFile, ProgressMap, ProgressRecord, QuestionCard, ReviewLevel, ReviewResult } from "../types";

export function clampLevel(level: number): ReviewLevel {
  return Math.max(0, Math.min(7, Math.round(level))) as ReviewLevel;
}

function createEmptyProgress(cardId: string): ProgressRecord {
  return {
    cardId,
    level: 0,
    lastReviewAt: null,
    nextReviewAt: null,
    editedAnswer: null,
    isHidden: false,
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeProgress(cardId: string, partial?: Partial<ProgressRecord> | null): ProgressRecord {
  const base = createEmptyProgress(cardId);
  return {
    ...base,
    ...partial,
    cardId,
    level: clampLevel(partial?.level ?? base.level),
    lastReviewAt: partial?.lastReviewAt ?? null,
    nextReviewAt: partial?.nextReviewAt ?? null,
    editedAnswer: partial?.editedAnswer ?? null,
    isHidden: Boolean(partial?.isHidden ?? base.isHidden),
    updatedAt: partial?.updatedAt ?? base.updatedAt,
  };
}

export function getProgressRecord(cardId: string, progressMap: ProgressMap): ProgressRecord {
  return normalizeProgress(cardId, progressMap[cardId]);
}

export function reviewCard(progress: ProgressRecord, result: ReviewResult, now = new Date()): ProgressRecord {
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

export function isDue(progress: ProgressRecord, now = new Date()): boolean {
  if (progress.level === 0) return true;
  if (progress.level === 7) return false;
  if (!progress.nextReviewAt) return true;
  return new Date(progress.nextReviewAt).getTime() <= now.getTime();
}

export function getEditedAnswer(card: QuestionCard, progress: ProgressRecord): string {
  const edited = progress.editedAnswer?.trim();
  return edited ? edited : card.a;
}

export function mergeProgressMaps(left: ProgressMap, right: ProgressMap): ProgressMap {
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

export function formatNextReview(dateIso: string | null): string {
  if (!dateIso) return "已掌握";

  const delta = Date.parse(dateIso) - Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (delta <= day && delta >= 0) return "今天";
  return `${Math.max(1, Math.round(delta / day))} 天后`;
}

export function describeResultPreview(progress: ProgressRecord, result: ReviewResult): string {
  const next = reviewCard(progress, result);
  return `Lv${next.level} / ${formatNextReview(next.nextReviewAt)}`;
}

export function readLocalProgress(): ProgressMap {
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

export function writeLocalProgress(progressMap: ProgressMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progressMap));
}

export function buildBackup(progressMap: ProgressMap): BackupFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: Object.values(progressMap),
  };
}

export function parseBackup(raw: string): ProgressMap {
  const parsed = JSON.parse(raw) as Partial<BackupFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.progress)) {
    throw new Error("备份文件格式不正确");
  }

  return parsed.progress.reduce<ProgressMap>((accumulator, record) => {
    if (!record.cardId) return accumulator;
    accumulator[record.cardId] = normalizeProgress(record.cardId, record);
    return accumulator;
  }, {});
}
