import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  clampLevel,
  mergeProgressMaps,
  normalizeProgress,
  readLocalProgress,
  writeLocalProgress,
} from "./progress";
import type { ProgressMap, ProgressRecord, SyncInfo, UserProgressRow } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SYNC_TIMEOUT_MS = 4000;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function getSession(): Promise<Session | null> {
  if (!supabase) return null;

  const {
    data: { session },
  } = await withTimeout(supabase.auth.getSession(), SYNC_TIMEOUT_MS, "恢复登录态超时。");

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
      isHidden: row.is_hidden,
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
    is_hidden: record.isHidden,
    updated_at: record.updatedAt,
  }));
}

async function fetchRemoteProgress(session: Session): Promise<ProgressMap> {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("user_progress")
    .select("user_id, card_id, level, last_review_at, next_review_at, edited_answer, is_hidden, updated_at")
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

export async function hydrateProgress(sessionOverride?: Session | null): Promise<{
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
}> {
  const localProgress = readLocalProgress();

  try {
    const session = sessionOverride === undefined ? await getSession() : sessionOverride;

    if (!session) {
      return {
        progressMap: localProgress,
        syncInfo: localSyncInfo(
          hasSupabaseEnv ? "未登录，当前使用本地进度。" : "当前仅本地模式，未配置 Supabase。",
        ),
      };
    }

    const remoteProgress = await withTimeout(fetchRemoteProgress(session), SYNC_TIMEOUT_MS, "拉取云端进度超时。");
    const merged = mergeProgressMaps(localProgress, remoteProgress);
    writeLocalProgress(merged);

    if (Object.keys(merged).length > 0) {
      void pushRemoteProgress(merged, session).catch((error) => {
        console.error("background sync failed", error);
      });
    }

    return {
      progressMap: merged,
      syncInfo: {
        mode: "cloud",
        configured: true,
        userEmail: session.user.email ?? null,
        lastSyncedAt: new Date().toISOString(),
        message: "云同步已开启。",
      },
    };
  } catch (error) {
    console.error("hydrateProgress failed", error);
    return {
      progressMap: localProgress,
      syncInfo: localSyncInfo("云端读取失败，已回退到本地进度。"),
    };
  }
}

export async function saveProgressRecord(record: ProgressRecord): Promise<{ syncInfo: SyncInfo }> {
  const nextMap = {
    ...readLocalProgress(),
    [record.cardId]: normalizeProgress(record.cardId, record),
  };

  writeLocalProgress(nextMap);

  const session = await getSession();
  if (!session) {
    return {
      syncInfo: localSyncInfo(
        hasSupabaseEnv ? "已保存到本地，登录后可自动同步。" : "已保存到本地。",
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
        message: "已同步到云端。",
      },
    };
  } catch {
    return {
      syncInfo: localSyncInfo("云端保存失败，已保留本地进度。", session.user.email ?? null),
    };
  }
}

export async function mergeImportedBackup(imported: ProgressMap): Promise<{
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
}> {
  const merged = mergeProgressMaps(readLocalProgress(), imported);
  writeLocalProgress(merged);

  const session = await getSession();
  if (!session) {
    return {
      progressMap: merged,
      syncInfo: localSyncInfo("备份已导入到本地。"),
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
        message: "备份已导入并同步到云端。",
      },
    };
  } catch {
    return {
      progressMap: merged,
      syncInfo: localSyncInfo("云端同步失败，备份已导入到本地。", session.user.email ?? null),
    };
  }
}

export async function signUpWithPassword(email: string, password: string): Promise<string> {
  if (!supabase) {
    throw new Error("尚未配置 Supabase。");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  if (data.session) {
    return "注册成功，已自动登录。";
  }

  return "注册成功，请检查邮箱确认；若想免确认，请去 Supabase Dashboard 关闭 Confirm email。";
}

export async function signInWithPassword(email: string, password: string): Promise<string> {
  if (!supabase) {
    throw new Error("尚未配置 Supabase。");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return "登录成功。";
}

export async function signOutCloud(): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function forceCloudSync(progressMap: ProgressMap): Promise<{
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
}> {
  const session = await getSession();
  if (!session) {
    return {
      progressMap,
      syncInfo: localSyncInfo("你还没有登录。"),
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
      message: "已完成云端同步。",
    },
  };
}
