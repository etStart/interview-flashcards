import type { StudyMode, SyncInfo } from "../types";

export const STORAGE_KEY = "interview-flashcards.progress.v1";
export const SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 9999] as const;

export const MODE_LABELS: Record<StudyMode, string> = {
  due: "今日到期",
  all: "全部卡片",
  unseen: "未学习",
  forgotten: "忘了 Lv1",
  random: "随机 10 题",
};

export const EMPTY_SYNC_INFO: SyncInfo = {
  mode: "local",
  configured: false,
  userEmail: null,
  lastSyncedAt: null,
  message: "准备中...",
};
