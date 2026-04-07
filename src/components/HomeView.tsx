import { getProgressRecord, isDue } from "../lib/progress";
import { getCategoriesForGroup, questionBank } from "../lib/questionBank";
import type { Group, ProgressMap, SyncInfo } from "../types";

type HomeViewProps = {
  progressMap: ProgressMap;
  syncInfo: SyncInfo;
  onOpenGroup: (group: Group) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onOpenCloud: () => void;
};

export default function HomeView(props: HomeViewProps) {
  const { progressMap, syncInfo, onOpenGroup, onExportBackup, onImportBackup, onOpenCloud } = props;
  const allCards = questionBank.categories.flatMap((category) => category.cards);
  const visibleCards = allCards.filter((card) => !getProgressRecord(card.id, progressMap).isHidden);
  const totalCards = visibleCards.length;
  const dueCount = visibleCards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length;
  const reviewedCount = visibleCards.filter((card) => getProgressRecord(card.id, progressMap).level > 0).length;
  const masteredCount = visibleCards.filter((card) => getProgressRecord(card.id, progressMap).level === 7).length;
  const fluency =
    totalCards === 0
      ? 0
      : Math.round(
          (visibleCards.reduce((sum, card) => sum + getProgressRecord(card.id, progressMap).level, 0) /
            (totalCards * 7)) *
            100,
        );

  return (
    <div className="screen">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">首页</span>
          <h1>面试闪卡训练</h1>
          <p>基于本地 JSON 的离线优先题库，支持分组练习、SRS 复习、答案编辑与云同步。</p>
        </div>

        <div className="hero-panel">
          <div className="sync-badge" data-mode={syncInfo.mode}>
            <span>{syncInfo.mode === "cloud" ? "云端" : "本地"}</span>
            <strong>{syncInfo.message ?? "就绪"}</strong>
          </div>

          <div className="hero-stats">
            <div>
              <span>今日到期</span>
              <strong>{dueCount}</strong>
            </div>
            <div>
              <span>已学习</span>
              <strong>
                {reviewedCount}/{totalCards}
              </strong>
            </div>
            <div>
              <span>Lv7</span>
              <strong>{masteredCount}</strong>
            </div>
          </div>

          <div className="progress-block">
            <div className="progress-label">
              <span>整体熟练度</span>
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
          导出备份
        </button>
        <button className="secondary-button" onClick={onImportBackup}>
          导入备份
        </button>
        <button className="primary-button" onClick={onOpenCloud}>
          账号与同步
        </button>
      </section>

      <section className="group-grid">
        {questionBank.groups.map((group) => {
          const categories = getCategoriesForGroup(group);
          const cards = categories.flatMap((category) => category.cards);
          const visibleGroupCards = cards.filter((card) => !getProgressRecord(card.id, progressMap).isHidden);
          const groupDueCount = visibleGroupCards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length;
          const groupReviewed = visibleGroupCards.filter((card) => getProgressRecord(card.id, progressMap).level > 0).length;

          return (
            <article className="group-card" key={group.id}>
              <div className="group-card-head">
                <div>
                  <span className="group-name">{group.name}</span>
                  <p>{categories.map((category) => category.name).join(" / ")}</p>
                </div>
                <span className="pill">{visibleGroupCards.length} 张卡片</span>
              </div>

              <div className="group-card-meta">
                <div>
                  <span>待复习</span>
                  <strong>{groupDueCount}</strong>
                </div>
                <div>
                  <span>已学习</span>
                  <strong>{groupReviewed}</strong>
                </div>
                <div>
                  <span>分类数</span>
                  <strong>{categories.length}</strong>
                </div>
              </div>

              <button className="primary-button full-width" onClick={() => onOpenGroup(group)}>
                进入分组
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
