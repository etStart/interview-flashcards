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

export async function hydrateProgress(): Promise<{ progressMap: ProgressMap; syncInfo: SyncInfo }> {
  const localProgress = readLocalProgress();
  const session = await getSession();

  if (!session) {
    return {
      progressMap: localProgress,
      syncInfo: localSyncInfo(
        hasSupabaseEnv ? "当前为本地模式，登录后可开启云同步。" : "当前为本地模式，尚未配置 Supabase。",
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
        message: "云同步已开启。",
      },
    };
  } catch {
    return {
      progressMap: localProgress,
      syncInfo: localSyncInfo("读取云端数据失败，已回退到本地数据。", session.user.email ?? null),
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
        hasSupabaseEnv ? "已保存到本地，登录后会自动尝试同步。" : "已保存到本地。",
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
      syncInfo: localSyncInfo("已保存到本地，但云同步失败。", session.user.email ?? null),
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
      syncInfo: localSyncInfo("备份已导入到本地存储。"),
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
        message: "备份已导入，并同步到云端。",
      },
    };
  } catch {
    return {
      progressMap: merged,
      syncInfo: localSyncInfo("备份已导入本地，但云同步失败。", session.user.email ?? null),
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

  return "注册请求已提交，但当前 Supabase 仍启用了邮箱确认。若你要完全免邮件登录，请在 Supabase Dashboard 里关闭 Confirm email。";
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
      syncInfo: localSyncInfo("尚未登录，暂时无法同步。"),
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
      message: "已完成手动同步。",
    },
  };
}
