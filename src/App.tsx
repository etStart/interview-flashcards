import { useEffect, useRef, useState, type ChangeEvent } from "react";
import CloudPanel from "./components/CloudPanel";
import GroupView from "./components/GroupView";
import HomeView from "./components/HomeView";
import StudyView from "./components/StudyView";
import { EMPTY_SYNC_INFO, MODE_LABELS } from "./lib/constants";
import { buildBackup, getProgressRecord, parseBackup, reviewCard } from "./lib/progress";
import { buildDeck } from "./lib/questionBank";
import {
  forceCloudSync,
  hydrateProgress,
  mergeImportedBackup,
  saveProgressRecord,
  signInWithPassword,
  signOutCloud,
  signUpWithPassword,
  supabase,
} from "./lib/sync";
import type {
  DeckEntry,
  Group,
  ProgressMap,
  ProgressRecord,
  ReviewResult,
  StudyMode,
  StudySession,
  SyncInfo,
} from "./types";
import "./app.css";

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
      setToast("请至少选择一个分类。");
      return;
    }

    const cards = buildDeck(selectedGroup, categoryIds, mode, progressMap);
    if (cards.length === 0) {
      setToast("当前筛选下没有卡片。");
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
    setToast("答案已保存。");
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
    setToast("备份已导出。");
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = parseBackup(await file.text());
      const merged = await mergeImportedBackup(imported);
      setProgressMap(merged.progressMap);
      setSyncInfo(merged.syncInfo);
      setToast("备份已导入。");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "导入备份失败。");
    } finally {
      event.target.value = "";
    }
  }

  async function handleForceSync() {
    const synced = await forceCloudSync(progressMap);
    setProgressMap(synced.progressMap);
    setSyncInfo(synced.syncInfo);
    setToast("同步完成。");
  }

  async function handleSignOut() {
    await signOutCloud();
    const hydrated = await hydrateProgress();
    setProgressMap(hydrated.progressMap);
    setSyncInfo(hydrated.syncInfo);
  }

  function handleBackToHome() {
    setSession(null);
    setSelectedGroup(null);
  }

  if (isHydrating) {
    return (
      <main className="app-shell loading-shell">
        <div className="loading-card">
          <span className="eyebrow">启动中</span>
          <h1>正在加载你的卡片...</h1>
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
          onBack={handleBackToHome}
          onRate={handleRate}
          onSaveAnswer={handleSaveAnswer}
        />
      ) : null}

      <CloudPanel
        open={cloudOpen}
        syncInfo={syncInfo}
        onClose={() => setCloudOpen(false)}
        onSignUp={signUpWithPassword}
        onSignIn={signInWithPassword}
        onSignOut={handleSignOut}
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
